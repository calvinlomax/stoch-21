'use strict';
importScripts('./rules.js', './engine.js', './modes-core.js', './laboratory-core.js');
let shard;
onmessage = event => {
  try {
    const data = event.data;
    if (data.type === 'init') { shard = new BJLab.Shard(data.jobs, data.settings); shard.restore(data.checkpoints); postMessage({ type: 'ready' }); }
    else if (data.type === 'tick') postMessage({ type: 'tick', tick: data.tick, updates: shard.tick(), states: data.checkpoint ? shard.dump() : null });
    else if (data.type === 'checkpoint') postMessage({ type: 'checkpoint', states: shard.dump() });
    else if (data.type === 'replay') {
      const replay = new BJLab.Shard([data.job], { ...data.settings, tickHands: 1, hands: data.round });
      while (!replay.jobs[0].done && replay.jobs[0].rounds < data.round) replay.tick();
      postMessage({ type: 'replay', snapshot: replay.jobs[0].sim.snap(null), round: replay.jobs[0].rounds });
    }
  } catch (error) { postMessage({ type: 'error', message: error.message }); }
};
