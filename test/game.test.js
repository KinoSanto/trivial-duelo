import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { io } from 'socket.io-client';
const bank = JSON.parse(readFileSync(new URL('../questions.json', import.meta.url), 'utf8'));
const byText = new Map(bank.map(q => [q.text,q]));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function wait(socket,event,ms=10000,predicate=()=>true) {
  return new Promise((resolve,reject) => {
    const handler = value => {if(!predicate(value)) return; clearTimeout(timer);socket.off(event,handler);resolve(value);};
    const timer = setTimeout(() => {socket.off(event,handler);reject(new Error(`Timeout: ${event}`));},ms);
    socket.on(event,handler);
  });
}
async function withServer(run) {
  const env = {...process.env,PORT:'0',NODE_ENV:'test'};
  delete env.DATABASE_URL; delete env.RENDER;
  const server = spawn(process.execPath,['--require','./test/fast-timers.cjs','server.js'],{cwd,env,stdio:['ignore','pipe','pipe']});
  const sockets=[];
  try {
    const port = await new Promise((resolve,reject) => {
      let output='';const timer=setTimeout(()=>reject(new Error(`Startup timed out: ${output}`)),10000);
      server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}: ${output}`));});
      server.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/puerto (\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});
      server.stderr.on('data',chunk=>{output+=chunk;});
    });
    const url=`http://127.0.0.1:${port}`;
    const connect=async()=>{const socket=io(url,{transports:['websocket'],forceNew:true});sockets.push(socket);await wait(socket,'connect');return socket;};
    await run({url,connect});
  } finally {
    sockets.forEach(s=>s.disconnect());
    const exited=once(server,'exit');server.kill();await exited;
  }
}
async function create(socket,settings={}) {
  const pending=wait(socket,'room');socket.emit('create',{name:'Mismo nombre',...settings});return pending;
}
async function join(socket,code) {
  const pending=wait(socket,'room');socket.emit('join',{name:'Mismo nombre',code});return pending;
}
async function error(socket,event,payload) {
  const pending=wait(socket,'errorMessage');socket.emit(event,payload);return pending;
}

test('complete matches of 10,20,30,40,50 questions with 2,3,4,6,8 players', {timeout:30000}, async()=>{
  await withServer(async({url,connect})=>{
    assert.deepEqual(await (await fetch(url+'/health')).json(),{ok:true,persistent:false,questions:2000});
    assert.equal((await fetch(url+'/questions.json')).status,404);
    const seen=new Set();
    for (const [total,count] of [[10,2],[20,3],[30,4],[40,6],[50,8]]) {
      const players=await Promise.all(Array.from({length:count},()=>connect()));
      const room=await create(players[0],{total,difficulty:'hard'});
      assert.equal(room.total,total);assert.equal(room.duration,25);assert.equal(room.maxPlayers,8);
      for (const socket of players.slice(1)) await join(socket,room.code);
      const received=players.map(()=>[]);
      const results=Promise.all(players.map(s=>wait(s,'finished')));
      players.forEach((socket,i)=>socket.on('question',q=>{
        received[i].push(q);
        const answer=byText.get(q.text).correct;
        socket.emit('answer',{index:i%2===0?answer:(answer+1)%4});
        socket.emit('answer',{index:answer}); // duplicates must not overwrite a wrong first answer
      }));
      players[0].emit('start');players[0].emit('start');
      const finished=await results;
      assert.equal(received[0].length,total);
      for (const qs of received) assert.deepEqual(qs,received[0]);
      for (const q of received[0]) {
        assert.equal(q.total,total);assert.equal(q.duration,25);assert.equal(q.difficulty,'hard');
        assert.equal(q.correct,undefined);assert.equal(q.explanation,undefined);
        assert.ok(!seen.has(q.text));seen.add(q.text);
      }
      for (const result of finished) assert.deepEqual(result.players.map(p=>p.score),players.map((_,i)=>i%2===0?total*100:0));
      players.forEach(s=>s.disconnect());
    }
  });
});

test('eight seats, host-only manual start, no automatic start or early reveal, no late join',async()=>{
  await withServer(async({connect})=>{
    const players=await Promise.all(Array.from({length:9},()=>connect()));
    const [host,guest]=players;
    assert.match(await error(host,'create',null),/no válidos/);
    assert.match(await error(host,'create',{name:{toString:1}}),/nombre/);
    for(const total of [0,25,'10',null,51]) assert.match(await error(host,'create',{name:'Ana',total}),/preguntas/);
    const room=await create(host,{total:10});
    assert.match(await error(host,'start'),/al menos dos/);
    for(const s of players.slice(1,8)) await join(s,room.code);
    assert.match(await error(players[8],'join',{name:'Noveno',code:room.code}),/completa/);
    assert.match(await error(guest,'start'),/creador/);
    let questions=0,reveals=0;host.on('question',()=>questions++);host.on('reveal',()=>reveals++);
    await sleep(80);assert.equal(questions,0);
    const qPromise=wait(host,'question');host.emit('start');const q=await qPromise;
    const remaining=q.deadline-Date.now();assert.ok(remaining>23500&&remaining<=25100);
    assert.match(await error(players[8],'join',{name:'Tarde',code:room.code}),/completa|comenzado/);
    for(const s of players.slice(0,7)) s.emit('answer',{index:0});
    await sleep(80);assert.equal(reveals,0,'seven answers cannot reveal an eight-player round');
    const revealed=wait(host,'reveal');players[7].emit('answer',{index:0});
    assert.equal((await revealed).answers.length,8);
  });
});

test('departures free lobby seats; host closes lobby; remaining players can create another room',async()=>{
  await withServer(async({connect})=>{
    const [a,b,c,d]=await Promise.all(Array.from({length:4},()=>connect()));
    const room=await create(a);await join(b,room.code);await join(c,room.code);
    let updated=wait(a,'room',10000,r=>r.players.length===2);c.disconnect();assert.equal((await updated).players.length,2);
    assert.equal((await join(d,room.code)).players.length,3);
    const closed=Promise.all([wait(b,'roomClosed'),wait(d,'roomClosed')]);a.disconnect();await closed;
    assert.equal((await create(b)).players.length,1);
  });
});

test('active departures keep a match running with two or more and finish below two',async()=>{
  await withServer(async({connect})=>{
    const [a,b,c,d]=await Promise.all(Array.from({length:4},()=>connect()));
    const room=await create(a,{total:10});for(const s of [b,c,d]) await join(s,room.code);
    const question=wait(b,'question');a.emit('start');await question;
    let update=wait(b,'room',10000,r=>r.players[0].connected===false);a.disconnect();assert.equal((await update).status,'playing');
    b.emit('answer',{index:0});c.emit('answer',{index:1});
    const revealed=wait(b,'reveal');d.disconnect();assert.equal((await revealed).answers.length,4);
    const finished=wait(b,'finished');c.disconnect();assert.equal((await finished).players.length,4);
  });
});

test('unanswered round lasts the full 25 seconds', {timeout:35000}, async()=>{
  await withServer(async({connect})=>{
    const a=await connect(),b=await connect();const room=await create(a,{total:10});await join(b,room.code);
    const next=wait(a,'question');a.emit('start');const q=await next;
    const revealed=await wait(a,'reveal',30000);
    assert.ok(Date.now()>=q.deadline);
    assert.deepEqual(revealed.answers.map(p=>p.answer),[null,null]);
    assert.deepEqual(revealed.answers.map(p=>p.score),[0,0]);
  });
});

test('production refuses ephemeral history',async()=>{
  const env={...process.env,NODE_ENV:'production'};delete env.DATABASE_URL;
  const child=spawn(process.execPath,['server.js'],{cwd,env,stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  const [code]=await once(child,'exit');assert.notEqual(code,0);assert.match(stderr,/DATABASE_URL/);
});
