import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
const app=express();const http=createServer(app);const io=new Server(http);app.use(express.static('public'));
const bank=JSON.parse(readFileSync(new URL('./questions.json',import.meta.url)));
const rooms=new Map();const DURATION=20;
const pick=()=>{const arr=[...bank];for(let i=arr.length-1;i>0;i--){const j=randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}return arr.slice(0,20)};
const code=()=>Array.from({length:5},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
function emitRoom(r){io.to(r.code).emit('room',{code:r.code,players:r.players.map(p=>({name:p.name,score:p.score,connected:p.connected})),status:r.status,round:r.round+1,total:20});}
function question(r){if(r.round>=20){r.status='finished';clearTimeout(r.timer);io.to(r.code).emit('finished',{players:r.players.map(p=>({name:p.name,score:p.score}))});emitRoom(r);return;}r.status='playing';r.answers={};const q=r.questions[r.round];r.deadline=Date.now()+DURATION*1000;io.to(r.code).emit('question',{round:r.round+1,total:20,category:q.category,text:q.text,options:q.options,deadline:r.deadline});emitRoom(r);r.timer=setTimeout(()=>reveal(r),DURATION*1000+200);}
function reveal(r){if(r.status!=='playing')return;clearTimeout(r.timer);r.status='reveal';const q=r.questions[r.round];for(const p of r.players){if(r.answers[p.id]===q.correct)p.score+=100;}io.to(r.code).emit('reveal',{correct:q.correct,explanation:q.explanation,answers:r.players.map(p=>({name:p.name,answer:r.answers[p.id]??null,score:p.score}))});emitRoom(r);r.timer=setTimeout(()=>{r.round++;question(r)},4500);}
function err(s,message){s.emit('errorMessage',message)}
io.on('connection',s=>{
 s.on('create',({name}={})=>{name=String(name||'').trim().slice(0,22);if(!name)return err(s,'Introduce tu nombre.');let c;do{c=code()}while(rooms.has(c));const r={code:c,players:[{id:s.id,name,score:0,connected:true}],questions:pick(),round:0,status:'waiting',timer:null,answers:{}};rooms.set(c,r);s.join(c);s.data.room=c;emitRoom(r);});
 s.on('join',({code:c,name}={})=>{c=String(c||'').trim().toUpperCase();name=String(name||'').trim().slice(0,22);const r=rooms.get(c);if(!name)return err(s,'Introduce tu nombre.');if(!r)return err(s,'Sala no encontrada.');if(r.status!=='waiting'||r.players.length>=2)return err(s,'La sala ya está completa o ha comenzado.');r.players.push({id:s.id,name,score:0,connected:true});s.join(c);s.data.room=c;emitRoom(r);});
 s.on('start',()=>{const r=rooms.get(s.data.room);if(!r||r.players[0]?.id!==s.id||r.players.length!==2||r.status!=='waiting')return err(s,'Deben estar los dos jugadores para comenzar.');question(r);});
 s.on('answer',({index}={})=>{const r=rooms.get(s.data.room);if(!r||r.status!=='playing'||Date.now()>r.deadline||!r.players.some(p=>p.id===s.id)||Object.hasOwn(r.answers,s.id)||!Number.isInteger(index)||index<0||index>3)return; r.answers[s.id]=index;s.emit('answered',{index});if(Object.keys(r.answers).length===2)reveal(r);});
 s.on('disconnect',()=>{const r=rooms.get(s.data.room);if(!r)return;const p=r.players.find(p=>p.id===s.id);if(p)p.connected=false;emitRoom(r);if(r.status==='waiting'){rooms.delete(r.code);io.to(r.code).emit('errorMessage','Se ha cerrado la sala porque se desconectó el anfitrión.');}else if(r.status!=='finished'){clearTimeout(r.timer);r.status='finished';io.to(r.code).emit('errorMessage','Un jugador se ha desconectado. La partida ha terminado.');io.to(r.code).emit('finished',{players:r.players.map(p=>({name:p.name,score:p.score}))});}setTimeout(()=>{if(rooms.get(r.code)===r)rooms.delete(r.code)},15*60*1000);});
});
app.get('/health',(req,res)=>res.json({ok:true}));http.listen(process.env.PORT||3000,()=>console.log('Trivial listo'));
