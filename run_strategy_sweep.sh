#!/usr/bin/env bash
# Run all named Laboratory playing/betting pairs with default strategy parameters.
# Usage: bash run_strategy_sweep.sh [output.csv]
# Optional environment variables: ENVIRONMENTS, SESSIONS, HANDS, TICK_HANDS,
# EXPERIMENT_SEED. The existing output file is never overwritten.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"
output_file="${1:-strategy_sweep_$(date +%Y%m%d_%H%M%S).csv}"

node - "$output_file" <<'NODE'
'use strict';
const fs = require('node:fs');
const R = require('./rules');
const M = require('./modes-core');
const L = require('./laboratory-core');

function integer(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw Error(`${name} must be an integer between ${min} and ${max}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}

function csv(value) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

const started = Date.now();
const log = message => console.error(`[${new Date().toISOString()}] ${message}`);
let output;
try {
  const file = process.argv[2];
  const settings = { ...L.defaults(), environments: integer('ENVIRONMENTS', 10, 1, 128),
    sessions: integer('SESSIONS', 2, 1, 20), hands: integer('HANDS', 100, 1, 100000),
    tickHands: integer('TICK_HANDS', 5, 1, 100), seed: integer('EXPERIMENT_SEED', 91731, 0, 4294967295),
    workers: 1, compare: false, multiEnabled: false };
  if (settings.environments * settings.sessions * settings.hands > 2000000) throw Error('A strategy pair cannot exceed the Laboratory limit of 2,000,000 requested rounds.');

  const base = { rules: R.defaults(), decks: 6, penetration: 75, penetrationSigma: 3,
    penetrationMode: 'fixed', minBet: 10, baseBet: 25, starting: 10000, sessions: 1,
    rounds: settings.hands, seed: settings.seed, heroSeat: 2, countSystem: 'hiLo',
    finite: true, seats: M.seats(2, 10000) };
  const playModes = Object.entries(R.PLAYS), betModes = Object.entries(R.BETS);
  const pairCount = playModes.length * betModes.length;
  const runsPerPair = settings.environments * settings.sessions;
  const write = values => fs.writeFileSync(output, values.map(csv).join(',') + '\n');
  const record = (values, stats = null) => {
    const payload = values.pop();
    const wager = stats?.wager || 0;
    values.push(stats?.profit, stats?.wager, wager ? stats.profit / wager : null,
      stats?.wins, stats?.losses, stats?.pushes, stats?.blackjacks, stats?.drawdown ?? stats?.maxDrawdown, payload);
    write(values);
  };
  output = fs.openSync(file, 'wx');
  write(['record_type', 'run_id', 'playing_id', 'playing_strategy', 'betting_id', 'betting_strategy',
    'environment', 'session', 'shoe_seed', 'tick', 'requested_rounds', 'completed_rounds', 'status',
    'profit_cents', 'wager_cents', 'roi', 'wins', 'losses', 'pushes', 'blackjacks', 'max_drawdown', 'payload_json']);
  record(['manifest', '', '', '', '', '', '', '', '', '', '', '', '', {
    description: 'All named playing and betting pairs using BJRules defaults and the Laboratory design and Shard pipeline.',
    scope: 'One default parameterization per named pair; custom tables, functions, numeric parameters, and opponent settings are not enumerated.',
    rowTypes: { manifest: 'Sweep settings and interpretation', run: 'Full realized run configuration', tick: 'Complete Shard tick update, including every round point and cumulative statistics', pair_summary: 'Laboratory aggregate for a completed strategy pair', error: 'Failure details' },
    moneyUnits: 'Integer cents in tick points and stats; dollar amounts in run configuration.',
    pairedSeeds: 'Each strategy pair uses the same experiment seed and sampled environment design. Different decisions may consume cards differently.',
    settings, base, namedPlayingStrategies: playModes, namedBettingStrategies: betModes,
  }]);
  log(`Output: ${file} (new file; it will not overwrite an existing file).`);
  log(`Sweep: ${playModes.length} playing × ${betModes.length} betting = ${pairCount} pairs; ${runsPerPair} runs per pair, up to ${settings.hands} rounds each.`);
  log(`Total: ${pairCount * runsPerPair} runs and at most ${pairCount * runsPerPair * settings.hands} rounds. EV-optimal decisions can take substantially longer.`);
  log('Each pair uses the same Laboratory environment seed and the default settings for that named strategy.');

  let pairIndex = 0, completedRuns = 0;
  for (const [playId, playName] of playModes) for (const [betId, betName] of betModes) {
    pairIndex++;
    const pairStart = Date.now(), config = M.clone(base);
    config.rules.play.mode = playId; config.rules.bet.mode = betId;
    const design = L.design(config, settings), resultJobs = [];
    log(`Pair ${pairIndex}/${pairCount}: ${playName} / ${betName} (${runsPerPair} runs).`);
    for (const job of design.jobs) {
      const runId = `${playId}:${betId}:${job.id}`, prefix = [runId, playId, playName, betId, betName, job.environment + 1, job.session + 1, job.config.seed];
      record(['run', ...prefix, 0, settings.hands, 0, 'started', { config: job.config, environment: design.environments[job.environment], jobId: job.id }]);
      const shard = new L.Shard([job], settings);
      let tick = 0, latest = null, lastLog = Date.now();
      while (!shard.jobs[0].done) {
        tick++; latest = shard.tick()[0];
        record(['tick', ...prefix, tick, settings.hands, shard.jobs[0].rounds, latest.done ? 'complete' : 'running', latest], latest.stats);
        if (Date.now() - lastLog >= 15000) { log(`  ${runId}: ${shard.jobs[0].rounds}/${settings.hands} rounds, tick ${tick}.`); lastLog = Date.now(); }
      }
      resultJobs.push({ ...job, stats: latest.stats || shard.jobs[0].stats, done: true, reason: latest.reason, rebuys: latest.rebuys });
      completedRuns++;
      log(`  Run ${completedRuns}/${pairCount * runsPerPair}: environment ${job.environment + 1}, session ${job.session + 1}; ${shard.jobs[0].rounds} rounds; ${latest.reason || 'complete'}.`);
    }
    const summary = L.summarize(resultJobs, settings.confidence, false);
    record(['pair_summary', '', playId, playName, betId, betName, '', '', '', '', settings.hands,
      summary.rounds, 'complete', summary], summary);
    log(`Finished pair ${pairIndex}/${pairCount} in ${((Date.now() - pairStart) / 1000).toFixed(1)}s; observed ROI ${(summary.roi.point * 100).toFixed(3)}%; elapsed ${((Date.now() - started) / 60000).toFixed(1)} min.`);
  }
  fs.closeSync(output); output = undefined;
  log(`Complete: ${completedRuns} runs written to ${file} in ${((Date.now() - started) / 60000).toFixed(1)} minutes.`);
} catch (error) {
  if (output !== undefined) {
    try { fs.writeFileSync(output, ['error', '', '', '', '', '', '', '', '', '', '', '', 'failed', '', '', '', '', '', '', '', '', JSON.stringify({ message: error.message, stack: error.stack })].map(csv).join(',') + '\n'); fs.closeSync(output); } catch {}
  }
  log(`Stopped: ${error.message}. Any completed CSV rows remain in the output file.`);
  process.exitCode = 1;
}
NODE
