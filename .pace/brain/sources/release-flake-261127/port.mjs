import { Server, createServer } from 'node:net';
const listen = Server.prototype.listen;
let calls = 0;
const occupied = new Set();
const blockers = [];
Server.prototype.listen = function(options, callback) {
  if (typeof options === 'object' && options.host === '127.0.0.1' && ++calls >= 2 && !occupied.has(options.port)) {
    occupied.add(options.port);
    const blocker = createServer();
    blockers.push(blocker);
    blocker.unref();
    return listen.call(blocker, options, () => listen.call(this, options, callback)), this;
  }
  return listen.call(this, options, callback);
};
