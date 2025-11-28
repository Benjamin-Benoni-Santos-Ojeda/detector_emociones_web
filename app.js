// app.js - Lógica para detectar emociones con face-api.js (suavizado)
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const downloadModelsBtn = document.getElementById('downloadModelsBtn');
const logEl = document.getElementById('log');
const emotionBox = document.getElementById('emotion-box');
let stream=null, running=false, avgWindow=[];
const WINDOW_SIZE = 7;
const MODEL_ROOT = './models';

function log(...args){ logEl.textContent = args.join(' ') + '\n' + logEl.textContent; }

async function ensureModelsLoaded(){
  log('Cargando modelos desde ' + MODEL_ROOT + ' ...');
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_ROOT);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_ROOT);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_ROOT);
    log('Modelos cargados.');
    return true;
  } catch(e){
    log('No se pudieron cargar los modelos. Guarda los archivos de la carpeta "models" en la misma carpeta que index.html. Error: '+e);
    return false;
  }
}

async function startCamera(){
  if (running) return;
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}, audio:false});
    video.srcObject = stream;
    await video.play();
    running=true; startBtn.disabled=true; stopBtn.disabled=false; analyzeBtn.disabled=false;
    log('Cámara iniciada.');
    const ok = await ensureModelsLoaded();
    if (ok) runLoop(); else log('Modelos faltantes. Usa "Descargar pesos (models)".');
  }catch(e){ log('Error accediendo a la cámara: '+e); }
}

function stopCamera(){
  if(!running) return;
  stream.getTracks().forEach(t=>t.stop());
  running=false; startBtn.disabled=false; stopBtn.disabled=true; analyzeBtn.disabled=true;
  log('Cámara detenida.');
  ctx.clearRect(0,0,overlay.width,overlay.height);
  emotionBox.textContent='Emoción: —  | Confianza: —%'; avgWindow=[];
}

async function analyzeOnce(){
  if(!running) return;
  const dets = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions();
  drawDetections(dets);
  if(dets.length>0){ showSmoothed(dets[0].expressions); } else { emotionBox.textContent='No se detectó rostro'; }
}

function drawDetections(dets){
  ctx.clearRect(0,0,overlay.width,overlay.height);
  ctx.drawImage(video,0,0,overlay.width,overlay.height);
  dets.forEach(det=>{
    const box = det.detection.box;
    ctx.strokeStyle='#00FF00'; ctx.lineWidth=2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  });
}

function showSmoothed(emotions){
  const keys = Object.keys(emotions);
  const vec = keys.map(k=>emotions[k]);
  avgWindow.push(vec); if(avgWindow.length>WINDOW_SIZE) avgWindow.shift();
  const avg = new Array(vec.length).fill(0);
  avgWindow.forEach(v=>v.forEach((val,i)=>avg[i]+=val));
  const n=avgWindow.length; for(let i=0;i<avg.length;i++) avg[i]=avg[i]/n;
  let bestIndex=0; for(let i=1;i<avg.length;i++) if(avg[i]>avg[bestIndex]) bestIndex=i;
  const bestKey=keys[bestIndex]; const bestVal=Math.round(avg[bestIndex]*100);
  const mapping={angry:'Enojo',disgust:'Asco',fear:'Miedo',happy:'Felicidad',sad:'Tristeza',surprise:'Sorpresa',neutral:'Neutral'};
  const label = mapping[bestKey]||bestKey;
  emotionBox.textContent = `Emoción: ${label}  | Confianza: ${bestVal}%`;
}

async function runLoop(){
  while(running){
    try {
      const dets = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions();
      drawDetections(dets);
      if(dets.length>0) showSmoothed(dets[0].expressions);
    } catch(e){ log('Error en loop: '+e); }
    await new Promise(r=>setTimeout(r,120));
  }
}

// Download helper: triggers browser downloads of model files (user must save into models/)
function downloadWeights(){
  const base = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
  const files = [
    'tiny_face_detector_model-weights_manifest.json',
    'tiny_face_detector_model-shard1',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_expression_model-weights_manifest.json',
    'face_expression_model-shard1'
  ];
  files.forEach(name=>{
    const url = base + name;
    fetch(url).then(r=>{ if(!r.ok) throw new Error(r.status); return r.blob(); }).then(b=>{
      const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); a.remove();
      log('Descargado: '+name+' (guarda en carpeta models/)');
    }).catch(err=>log('No se pudo descargar '+name+': '+err));
  });
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
analyzeBtn.addEventListener('click', analyzeOnce);
downloadModelsBtn.addEventListener('click', downloadWeights);
video.addEventListener('playing', ()=>{ overlay.width = video.videoWidth; overlay.height = video.videoHeight; });
