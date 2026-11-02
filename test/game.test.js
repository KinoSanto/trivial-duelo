import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { io } from 'socket.io-client';
const bank = JSON.parse(readFileSync(new URL('../questions.json', import.meta.url), 'utf8'));
const byText = new Map(bank.map(q=>[q.text,q]));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const wait = (s,event,ms=10000) => new Promise((resolve,reject) => {
  const timer=setTimeout(()=>{s.off(event,handler);reject(new Error(`Timeout: ${event}`));},ms);
  function handler(value) {clearTimeout(timer);resolve(value);}
  s.once(event,handler);
});

test('two real clients play 20 synchronized rounds, score once, enforce host/room limits', {timeout:60000}, async () => {
  const env={...process.env, PORT:'0', NODE_ENV:'test'};
  delete env.DATABASE_URL; delete env.RENDER;
  const server=spawn(process.execPath,['--require','./test/fast-timers.cjs','server.js'],{cwd,env,stdio:['ignore','pipe','pipe']});
  const sockets=[];
  try {
    const port=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('Server startup timed out')),10000);
      server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}: ${output}`));});
      server.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/puerto (\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});
      server.stderr.on('data',chunk=>{output+=chunk;});
    });
    const url=`http://127.0.0.1:${port}`;
    const health=await (await fetch(url+'/health')).json();
    assert.deepEqual(health,{ok:true,persistent:false,questions:2000});
    assert.equal((await fetch(url+'/questions.json')).status,404);
    for(let i=0;i<3;i++) {const s=io(url,{transports:['websocket'],forceNew:true});sockets.push(s);await wait(s,'connect');}
    const [a,b,c]=sockets;
    let invalid=wait(a,'errorMessage'); a.emit('create',null);assert.match(await invalid,/no válidos/);
    invalid=wait(a,'errorMessage'); a.emit('create',{name:{toString:1}});assert.match(await invalid,/nombre/);
    let pending=wait(a,'room'); a.emit('create',{name:'Mismo nombre',difficulty:'hard'});
    const room=await pending;
    assert.equal(room.hostId,a.id);
    assert.equal(room.code.length,5);
    pending=wait(b,'room');b.emit('join',{name:'Mismo nombre',code:room.code});await pending;
    pending=wait(c,'errorMessage');c.emit('join',{name:'Tercero',code:room.code});assert.match(await pending,/completa/);
    pending=wait(b,'errorMessage');b.emit('start');assert.match(await pending,/dos jugadores/);
    const questions=[[],[]];const reveals=[];
    const finished=Promise.all([wait(a,'finished'),wait(b,'finished')]);
    [a,b].forEach((s,i)=>s.on('question',q=>{
      questions[i].push(q);
      assert.equal(q.total,20);assert.equal(q.difficulty,'hard');
      assert.ok(q.deadline-Date.now()>18500 && q.deadline-Date.now()<=20100, `remaining=${q.deadline-Date.now()} deadline=${q.deadline}`);
      assert.equal(q.correct,undefined);assert.equal(q.explanation,undefined);
      const answer=byText.get(q.text).correct;
      s.emit('answer',{index:i===0?answer:(answer+1)%4});
      s.emit('answer',{index:answer}); // duplicate answers must not change the first
    }));
    a.on('reveal',r=>reveals.push(r));
    a.emit('start'); a.emit('start');
    const results=await finished;
    assert.equal(questions[0].length,20);assert.deepEqual(questions[0],questions[1]);
    assert.equal(new Set(questions[0].map(q=>q.text)).size,20);
    assert.equal(reveals.length,20);
    assert.deepEqual(results[0].players.map(p=>p.score),[2000,0]);
    assert.deepEqual(results[0],results[1]);
    // Ended rooms do not block a new connection, and history remains shared.
    const d=io(url,{transports:['websocket'],forceNew:true});sockets.push(d);await wait(d,'connect');
    pending=wait(d,'room');d.emit('create',{name:'Nuevo'});const next=await pending;
    pending=wait(c,'room');c.emit('join',{name:'Rival',code:next.code});await pending;
    pending=wait(d,'question');d.emit('start');const q=await pending;
    assert.ok(!questions[0].some(old=>old.text===q.text));
    const timeoutReveal=await wait(d,'reveal',25000);
    assert.ok(Date.now() >= q.deadline, 'The unanswered round must last the full 20 seconds');
    assert.deepEqual(timeoutReveal.answers.map(p=>p.answer),[null,null]);
    assert.deepEqual(timeoutReveal.answers.map(p=>p.score),[0,0]);
    pending=wait(d,'finished');c.disconnect();await pending;
  } finally {
    sockets.forEach(s=>s.disconnect());
    const exited=once(server,'exit'); server.kill(); await exited;
  }
});

test('production refuses ephemeral history', async () => {
  const env={...process.env,NODE_ENV:'production'}; delete env.DATABASE_URL;
  const child=spawn(process.execPath,['server.js'],{cwd,env,stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  const [code]=await once(child,'exit');
  assert.notEqual(code,0);assert.match(stderr,/DATABASE_URL/);
});
