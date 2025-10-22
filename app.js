/* app.js - core client logic */
const firebaseConfig = {
  apiKey: "FIREBASE_API_KEY",
  authDomain: "FIREBASE_AUTH_DOMAIN",
  projectId: "FIREBASE_PROJECT_ID",
  storageBucket: "FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID",
  appId: "FIREBASE_APP_ID"
};

/* Load Firebase (we use CDN here for simplicity) */
const script = document.createElement('script');
script.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js";
document.head.appendChild(script);
script.onload = () => {
  const s2 = document.createElement('script');
  s2.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js";
  document.head.appendChild(s2);
  const s3 = document.createElement('script');
  s3.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js";
  document.head.appendChild(s3);
  s3.onload = initApp;
};

let app, auth, db, currentUser = null;
function initApp(){
  app = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();

  // UI elements
  const loginBtn = document.getElementById('loginBtn');
  const loginModal = document.getElementById('loginModal');
  const closeLogin = document.getElementById('closeLogin');
  const googleLogin = document.getElementById('googleLogin');
  const emailLogin = document.getElementById('emailLogin');
  const profileSetupBtn = document.getElementById('profileSetup');
  const profileModal = document.getElementById('profileModal');
  const saveProfile = document.getElementById('saveProfile');
  const inputName = document.getElementById('inputName');
  const inputGoal = document.getElementById('inputGoal');
  const prefStyle = document.getElementById('prefStyle');
  const themeSelector = document.getElementById('themeSelector');
  const chatModal = document.getElementById('chatModal');
  const openChatBtn = document.getElementById('openChatBtn');
  const closeChat = document.getElementById('closeChat');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendChat = document.getElementById('sendChat');

  // theme handling
  function applyTheme(t){
    if(t === 'auto'){
      // choose based on user preferred style if present, otherwise default to game
      const stored = localStorage.getItem('userStyle') || 'game';
      document.documentElement.setAttribute('data-theme', stored);
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
  }
  themeSelector.addEventListener('change', e => {
    applyTheme(e.target.value);
    if(e.target.value!=='auto') localStorage.setItem('userStyle', e.target.value)
  });
  // apply initial
  applyTheme('auto');

  // login modal
  loginBtn.addEventListener('click', ()=> loginModal.classList.remove('hidden'));
  closeLogin.addEventListener('click', ()=> loginModal.classList.add('hidden'));

  googleLogin.addEventListener('click', async ()=>{
    const provider = new firebase.auth.GoogleAuthProvider();
    try{
      await auth.signInWithPopup(provider);
      loginModal.classList.add('hidden');
    }catch(err){alert(err.message)}
  });

  emailLogin.addEventListener('click', async ()=>{
    const email = prompt('Seu email');
    const pass = prompt('Senha (min 6 chars)');
    if(!email || !pass) return alert('Cancelado');
    try{
      // try sign in, if fail create
      await auth.signInWithEmailAndPassword(email,pass);
      loginModal.classList.add('hidden');
    }catch(e){
      try{
        await auth.createUserWithEmailAndPassword(email,pass);
        loginModal.classList.add('hidden');
      }catch(err){ alert(err.message) }
    }
  });

  // auth listener
  auth.onAuthStateChanged(async user => {
    currentUser = user;
    const profileBox = document.getElementById('profileBox');
    const loginBtn = document.getElementById('loginBtn');
    if(user){
      loginBtn.textContent = 'Sair';
      loginBtn.onclick = ()=> auth.signOut();
      profileBox.textContent = `Usuário: ${user.email}`;
      // load profile
      const p = await db.collection('users').doc(user.uid).get();
      if(!p.exists){
        // create default profile
        await db.collection('users').doc(user.uid).set({name:user.displayName||'',xp:0,level:1,stylePreference:'auto'});
      } else {
        const data = p.data();
        localStorage.setItem('userStyle', data.stylePreference||'auto');
        applyTheme('auto');
      }
    } else {
      loginBtn.textContent = 'Entrar';
      loginBtn.onclick = ()=> loginModal.classList.remove('hidden');
      profileBox.textContent = 'Sem usuário';
    }
  });

  // profile setup
  profileSetupBtn.addEventListener('click', ()=> profileModal.classList.remove('hidden'));
  saveProfile.addEventListener('click', async ()=>{
    const name = inputName.value.trim();
    const goal = inputGoal.value.trim();
    const style = prefStyle.value;
    if(!currentUser) return alert('Faça login primeiro');
    await db.collection('users').doc(currentUser.uid).set({name,goal,stylePreference:style,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}, {merge:true});
    localStorage.setItem('userStyle', style);
    applyTheme('auto');
    profileModal.classList.add('hidden');
    alert('Perfil salvo!');
  });

  // tasks (local-first, then Firestore)
  const tasksList = document.getElementById('tasksList');
  function renderTasks(tasks){
    tasksList.innerHTML = '';
    tasks.forEach((t,idx)=> {
      const li = document.createElement('li');
      li.innerHTML = `<span>${t.title}</span><span><button data-idx="${idx}" class="btn small">✓</button></span>`;
      tasksList.appendChild(li);
      li.querySelector('button').addEventListener('click', ()=> {
        awardXPForTask(t);
        tasks.splice(idx,1);
        saveTasks(tasks);
        renderTasks(tasks);
      });
    });
  }
  function getTasks(){ return JSON.parse(localStorage.getItem('tasks_v1') || '[]'); }
  function saveTasks(t){ localStorage.setItem('tasks_v1', JSON.stringify(t)); }

  document.getElementById('newTaskBtn').addEventListener('click', ()=> {
    const title = prompt('Nova tarefa');
    if(!title) return;
    const tasks = getTasks();
    tasks.push({title, createdAt:Date.now()});
    saveTasks(tasks);
    renderTasks(tasks);
  });

  // XP awarding
  function awardXPForTask(t){
    if(!currentUser) {
      // local XP
      const xp = Number(localStorage.getItem('xp')||0)+10;
      localStorage.setItem('xp', xp);
      updateXPUI(xp);
      return;
    }
    const ref = db.collection('users').doc(currentUser.uid);
    return db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const curXP = (doc.exists && doc.data().xp) ? doc.data().xp : 0;
      const newXP = curXP + 10;
      tx.update(ref, {xp:newXP});
      updateXPUI(newXP);
    });
  }
  function updateXPUI(xp){
    document.getElementById('xp').textContent = `XP ${xp}`;
    const lvl = Math.floor(Math.pow(xp/100 + 1, 1.1));
    document.getElementById('level').textContent = `Nível ${lvl}`;
  }

  // load tasks
  renderTasks(getTasks());
  updateXPUI(Number(localStorage.getItem('xp')||0));

  // Chat interactions and persona detection
  function detectPersonaFromAnswers(answers){
    // simple heuristic: count keywords -> game vs mentor
    const text = answers.join(' ').toLowerCase();
    const gameWords = ['desafio','competir','jogo','ranking','meta','xp','nivel','desempenho','velocidade'];
    const mentorWords = ['calma','propósito','significado','reflexão','mentalidade','valores','segurança','estabilidade'];
    let g=0,m=0;
    gameWords.forEach(w=> g += (text.includes(w) ? 1 : 0));
    mentorWords.forEach(w=> m += (text.includes(w) ? 1 : 0));
    if(g>m) return 'game';
    if(m>g) return 'mentor';
    return 'balanced';
  }

  // initial quick quiz to seed persona
  async function runInitialQuizIfNeeded(){
    if(localStorage.getItem('persona')) return;
    const q1 = prompt('1) O que mais te motiva hoje? (digite curto)');
    const q2 = prompt('2) Você prefere desafios rápidos ou reflexões profundas?');
    const persona = detectPersonaFromAnswers([q1||'', q2||'']);
    localStorage.setItem('persona', persona);
    localStorage.setItem('quizAnswers', JSON.stringify([q1,q2]));
    if(persona === 'game') localStorage.setItem('userStyle','game');
    if(persona === 'mentor') localStorage.setItem('userStyle','mentor');
    applyTheme('auto');
  }
  runInitialQuizIfNeeded();

  // chat UI
  openChatBtn.addEventListener('click', ()=>{
    chatModal.classList.remove('hidden');
    chatMessages.innerHTML = '';
    const greeting = generateMentorGreeting();
    pushMessage('ai', greeting);
  });
  closeChat.addEventListener('click', ()=> chatModal.classList.add('hidden'));
  sendChat.addEventListener('click', async ()=>{
    const text = chatInput.value.trim();
    if(!text) return;
    pushMessage('user', text);
    chatInput.value='';
    // send to function
    const persona = localStorage.getItem('persona') || 'balanced';
    pushMessage('ai','...'); // placeholder
    try {
      const resp = await fetch('/.netlify/functions/mentorChat', { // change endpoint if using Firebase
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          userId: currentUser ? currentUser.uid : 'anon',
          message: text,
          persona
        })
      });
      const json = await resp.json();
      // expect {diagnosis, plan, tasks, text}
      // replace last ai placeholder
      chatMessages.lastElementChild && (chatMessages.lastElementChild.innerHTML = `<div class="ai">${json.text || json.diagnosis || '...'}</div>`);
      if(json.tasks && json.tasks.length){
        // add as tasks
        const tasks = getTasks();
        json.tasks.forEach(t => tasks.push({title:t.title || t, createdAt:Date.now()}));
        saveTasks(tasks);
        renderTasks(tasks);
      }
      // give XP for action: small
      const xpNow = Number(localStorage.getItem('xp')||0) + 5;
      localStorage.setItem('xp', xpNow);
      updateXPUI(xpNow);
    } catch(e){
      // fallback: simple built-in mentor
      chatMessages.lastElementChild && (chatMessages.lastElementChild.innerHTML = `<div class="ai">Desculpe, houve um erro. Aqui vai uma dica rápida: que tal listar 3 coisas que você gosta de fazer todos os dias?</div>`);
    }
  });

  function pushMessage(who, text){
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + who;
    wrap.innerHTML = `<div class="bubble">${text}</div>`;
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function generateMentorGreeting(){
    const persona = localStorage.getItem('persona') || 'balanced';
    if(persona === 'game') return "Pronto para o desafio? Vou montar uma missão rápida pra você ganhar XP!";
    if(persona === 'mentor') return "Vamos refletir sobre seu propósito. Conte-me o que te fez levantar hoje.";
    return "Oi — como posso te ajudar hoje? Quer uma missão prática ou uma reflexão profunda?";
  }

  // service worker registration for PWA
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }

  // FAB quick menu
  document.getElementById('fab').addEventListener('click', ()=> {
    const opt = prompt('Digite 1 para Nova Meta, 2 para Nova Tarefa, 3 para Abrir Mentoria');
    if(opt==='1') alert('Criar meta — Em breve edição visual');
    if(opt==='2') document.getElementById('newTaskBtn').click();
    if(opt==='3') openChatBtn.click();
  });

  // quick save on unload
  window.addEventListener('beforeunload', ()=>{
    // persist tasks already in localStorage
  });
}
