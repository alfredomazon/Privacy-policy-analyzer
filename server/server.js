const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-token';
const STATUS_FILE = path.join(__dirname, 'status.json');

function readStatus(){
  try{ return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); }catch(e){ return {enabled:false}; }
}
function writeStatus(obj){
  fs.writeFileSync(STATUS_FILE, JSON.stringify(obj, null, 2));
}

const app = express();
app.use(bodyParser.json());
// allow cross origin for testing
app.use((req,res,next)=>{ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Admin-Token'); next(); });

app.get('/status', (req,res)=>{
  res.json(readStatus());
});

app.post('/status', (req,res)=>{
  const token = req.get('X-Admin-Token');
  if(token !== ADMIN_TOKEN){
    return res.status(401).json({ok:false,error:'unauthorized'});
  }
  const body = req.body || {};
  const enabled = !!body.enabled;
  writeStatus({enabled});
  res.json({ok:true,enabled});
});

app.listen(PORT, ()=>console.log(`Admin server listening on http://localhost:${PORT} (ADMIN_TOKEN=${ADMIN_TOKEN})`));
