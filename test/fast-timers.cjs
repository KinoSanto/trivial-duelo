// Test-process preload only. The production server has fixed 20-second deadlines.
const realTimeout = global.setTimeout;
global.setTimeout = (fn, delay, ...args) => realTimeout(fn, delay === 4500 ? 15 : delay, ...args);
