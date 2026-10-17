import {crowdState} from './crowd-model.js';

const grid = document.getElementById('placeGrid');
const status = document.getElementById('mapStatus');
const search = document.getElementById('placeSearch');
const dialog = document.getElementById('detailSheet');
const maps = document.getElementById('floorMaps');
const connection = document.getElementById('crowdConnection');
const names = {all:'全体', '1f':'1階', '2f':'2階', '3f':'3階', other:'管理棟・中庭', gyms:'体育館'};
let area = 'all';
let places = [];
let records = new Map();
let fresh = false;
let failed = false;
let loading = false;
let stopEvents;
let lastFocus;

function verifiedState(record, connected) {
  // A status without a server timestamp cannot establish freshness.
  if (!record?.updatedAt?.toMillis?.()) return crowdState(null, connected);
  return crowdState(record, connected);
}
function mapStateLabel(state) {
  return {quiet:'空いている',moderate:'やや混雑',busy:'混雑',closed:'終了・停止'}[state.tone] || (state.compact === '催事なし' ? '催事なし' : state.compact === '通信確認中' ? '通信確認中' : '要確認');
}

function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
function stateFor(place) {
  const connected = fresh && navigator.onLine && !failed;
  const states = place.events.map(item => verifiedState(records.get(item.id), connected));
  if (!states.length) return {tone:'unknown', compact:'催事なし', text:'現在、この場所に催事はありません。'};
  // A shared place must not look fresh while one of its events is unverified.
  if (states.some(state => state.tone === 'unknown')) return {tone:'unknown', compact: connected ? '未更新・要確認' : '通信確認中', text:states.map(state => state.text).join(' ／ ')};
  const rank = {quiet:0, moderate:1, busy:2, closed:3};
  if (states.every(state => state.tone === 'closed')) return states[0];
  return states.filter(state => state.tone !== 'closed').sort((a,b) => rank[b.tone] - rank[a.tone])[0];
}
function badge(state) {
  const element = text('span', state.compact, 'crowd-badge');
  element.dataset.tone = state.tone;
  element.title = state.text;
  return element;
}
function showDetails(place, trigger) {
  lastFocus = trigger;
  document.getElementById('sheetArea').textContent = names[place.area];
  document.getElementById('sheetTitle').textContent = place.label;
  const content = document.getElementById('sheetEvents');
  content.replaceChildren();
  for (const item of place.events) {
    const card = text('article', '', 'event');
    card.append(text('h3', item.name));
    const meta = [item.room, item.time].filter(Boolean).join(' ・ ');
    if (meta) card.append(text('p', meta, 'meta'));
    const state = verifiedState(records.get(item.id), fresh && navigator.onLine && !failed);
    const crowd = badge({...state, compact:state.text});
    crowd.dataset.detailCrowd = item.id;
    card.append(crowd);
    if (item.desc) card.append(text('p', item.desc));
    content.append(card);
  }
  if (!place.events.length) content.append(text('p', '現在、この場所に催事はありません。'));
  if (place.area === 'gyms') {
    const link = text('a', '体育館の特別催事を見る', 'more-link');
    link.href = 'taiikukan.html';
    content.append(link);
  }
  dialog.showModal();
}
document.getElementById('sheetClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { if (lastFocus?.isConnected) lastFocus.focus(); });
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

const ns = 'http://www.w3.org/2000/svg';
function svgElement(tag, attributes, label) {
  const element = document.createElementNS(ns, tag);
  for (const [key,value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (label !== undefined) element.textContent = label;
  return element;
}
// A shallow axonometric projection keeps room labels horizontal and legible.
const project = (x,y) => [95 + x * .94 - y * .55, 12 + x * .22 + y * .65];
function polygon(x,y,w,h,className) {
  return svgElement('polygon', {points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p => project(...p).join(',')).join(' '), class:className});
}
function addLabel(svg, x,y,label,className) {
  const [px,py] = project(x,y);
  svg.append(svgElement('text',{x:px,y:py,'text-anchor':'middle',class:className},label));
}
function room(svg, place, x,y,w=72,h=82) {
  const state = stateFor(place);
  const group = svgElement('g',{class:'map-room',role:'button',tabindex:'0','data-key':place.key,'data-tone':state.tone,'aria-label':`${place.label}：${place.events.map(item => item.name).join('、') || '催事なし'}、${state.compact}`});
  group.append(svgElement('title',{},`${place.label}：${place.events.map(item => item.name).join('、') || '催事なし'}\n${state.text}`));
  group.append(polygon(x,y,w,h,'room-shape'));
  addLabel(group,x+w/2,y+h/2-4,place.shortLabel,'room-number');
  addLabel(group,x+w/2,y+h/2+19,mapStateLabel(state),'room-state');
  group.addEventListener('click', () => showDetails(place,group));
  group.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();showDetails(place,group);}
  });
  svg.append(group);
}
function floorPanel(title, subtitle, key) {
  const panel = text('section','','floor-panel');
  const head = text('div','','floor-head');
  head.append(text('h2',title),text('p',subtitle));
  panel.append(head,text('p','左右に動かして教室を選べます','scroll-hint'));
  const scroll = text('div','','floor-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('aria-label',`${title}の案内図。左右にスクロールできます`);
  const svg = svgElement('svg',{viewBox:'0 0 900 300',class:'floor-svg',role:'group','aria-label':`${title}の催事と混雑状況`,'data-floor':key});
  scroll.append(svg); panel.append(scroll); maps.append(panel);
  return svg;
}
function renderMaps() {
  maps.replaceChildren();
  for (const floor of ['3f','2f','1f']) {
    if (area !== 'all' && area !== floor) continue;
    const svg = floorPanel(names[floor],'普通教室棟',floor);
    // The corridor runs behind the classrooms on every floor.
    svg.append(polygon(0,10,810,130,'floor-edge'),polygon(0,0,810,130,'floor-body'),polygon(0,0,810,35,'corridor'));
    const floorPlaces = places.filter(place => place.area === floor);
    const xs = [85,157,229,301,373,510,582,715];
    floorPlaces.forEach((place,index) => room(svg,place,xs[index],40));
    svg.append(polygon(5,40,36,82,'stairs'),polygon(42,40,40,82,'stairs'),polygon(448,40,58,82,'stairs'));
    addLabel(svg,23,85,'階段','stairs-text');
    addLabel(svg,62,85,'WC','stairs-text');
    addLabel(svg,477,85,'階段','stairs-text');
    svg.append(polygon(655,40,55,82,'stairs'));
    addLabel(svg,682,85,'WC','stairs-text');
    addLabel(svg,380,25,'廊下','map-label');
  }
  if (area === 'all' || area === 'gyms') {
    const svg = floorPanel('体育館','教室棟の右側にあります','gyms');
    svg.append(polygon(0,10,810,130,'floor-edge'),polygon(0,0,810,130,'floor-body'));
    const gymB = places.find(place => place.key === 'gymB');
    const gymA = places.find(place => place.key === 'gymA');
    if (gymB) room(svg,gymB,60,5,300,110);
    if (gymA) room(svg,gymA,440,5,300,110);
  }
  if (area === 'all' || area === 'other') {
    const svg = floorPanel('管理棟・校舎周辺','番号順の案内。詳しい位置は校内全体図へ','admin');
    svg.append(polygon(0,10,810,130,'floor-edge'),polygon(0,0,810,130,'floor-body'));
    ['25','26','27','28','29','34'].forEach((key,i) => {
      const place = places.find(place => place.key === key);
      if (place) room(svg,place,25+i*130,5,110,85);
    });
    const court = floorPanel('中庭','番号ごとの催事。詳しい位置は校内全体図へ','courtyard');
    court.append(polygon(0,10,810,130,'floor-edge'),polygon(0,0,810,130,'floor-body'));
    ['35','36','37','30','31','33','32','39','38'].forEach((key,i) => {
      const place = places.find(place => place.key === key);
      if (place) room(court,place,8+i*88,5,83,85);
    });
  }
}
const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase('ja').trim();
function renderDirectory() {
  const query = normalize(search.value);
  const filtered = places.filter(place => query
    ? normalize([place.label,...place.events.flatMap(item => [item.name,item.room || '',item.category || ''])].join(' ')).includes(query)
    : area === 'all' || place.area === area);
  grid.replaceChildren();
  for (const place of filtered) {
    const button = text('button','','place'); button.type='button'; button.dataset.key=place.key;
    button.append(text('span',place.label,'place-label'),text('span',place.events.map(item => item.name).join(' ／ ') || '催事なし','place-name'),badge(stateFor(place)));
    button.addEventListener('click', () => showDetails(place,button)); grid.append(button);
  }
  document.getElementById('resultCount').textContent = `${filtered.length}か所`;
  document.getElementById('emptyMessage').hidden = filtered.length > 0;
}
function updateCrowd() {
  const connected = fresh && navigator.onLine && !failed;
  const visibleKeys = new Set([...maps.querySelectorAll('[data-key]'),...grid.querySelectorAll('[data-key]')].map(node => node.dataset.key));
  const visiblePlaces = places.filter(place => place.events.length && visibleKeys.has(place.key));
  const allUnverified = visiblePlaces.length > 0 && visiblePlaces.every(place => stateFor(place).tone === 'unknown');
  document.getElementById('app').classList.toggle('crowd-summary-only', allUnverified);
  connection.textContent = !connected ? '混雑状況の最新情報を取得できません。会場でもご確認ください。各催事の詳細で前回の情報を確認できます。'
    : allUnverified ? '表示中の混雑状況はすべて未更新・要確認です。各催事を開くと、前回の状態と更新日時を確認できます。'
    : '混雑状況は淡い色で表示しています。30分以上経過した情報は「要確認」。詳しい更新日時は各催事を開いて確認できます。';
  // Update in place so live snapshots never remove the focused room or move the map scroll position.
  for (const node of document.querySelectorAll('[data-key]')) {
    const place = places.find(place => place.key === node.dataset.key);
    if (!place) continue;
    const state = stateFor(place);
    if (node.classList.contains('map-room')) {
      node.dataset.tone = state.tone;
      node.querySelector('.room-state').textContent = mapStateLabel(state);
      node.setAttribute('aria-label',`${place.label}：${place.events.map(item => item.name).join('、') || '催事なし'}、${state.compact}`);
      node.querySelector('title').textContent = `${place.label}：${place.events.map(item => item.name).join('、') || '催事なし'}\n${state.text}`;
    } else { node.querySelector('.crowd-badge').replaceWith(badge(state)); }
  }
  for (const node of dialog.querySelectorAll('[data-detail-crowd]')) {
    const state = verifiedState(records.get(node.dataset.detailCrowd),connected);
    node.dataset.tone = state.tone; node.textContent = state.text; node.title = state.text;
  }
}
document.querySelectorAll('[data-area]').forEach(button => button.addEventListener('click', () => {
  area=button.dataset.area; search.value='';
  document.querySelectorAll('[data-area]').forEach(node => node.setAttribute('aria-pressed',String(node === button)));
  renderMaps();renderDirectory();updateCrowd();
}));
search.addEventListener('input',() => {renderDirectory();updateCrowd();});
document.querySelector('.original-link').addEventListener('click', () => { document.getElementById('campusOverview').open = true; });
window.addEventListener('offline',updateCrowd);
window.addEventListener('online',() => {fresh=false;updateCrowd();});
setInterval(updateCrowd,30000);

function applyData(events,links) {
  const byId = new Map(Object.values(events).flatMap(group => group.items || []).map(item => [item.id,item]));
  places = [...Array.from({length:39},(_,i) => String(i+1)),'gymB','gymA'].map(key => {
    if (!Array.isArray(links[key])) throw new Error('地図番号の対応データを確認してください');
    const n=Number(key), classroom=n>=1 && n<=24, gym=key==='gymA' || key==='gymB';
    const floor=Math.floor((n-1)/8)+1;
    const roomNumber=`${floor}${String((n-1)%8+1).padStart(2,'0')}`;
    return {key,area:classroom?`${floor}f`:gym?'gyms':'other',label:classroom?`${roomNumber}教室`:gym?key==='gymA'?'第1体育館':'第2体育館':`地図番号 ${key}`,shortLabel:classroom?roomNumber:gym?key==='gymA'?'第1体育館':'第2体育館':key,events:links[key].map(id => byId.get(id)).filter(item => item && item.name!=='（なし）')};
  });
  if (dialog.open) dialog.close();
  renderMaps();renderDirectory();updateCrowd();
}
async function loadMap() {
  if (loading) return;
  loading=true;
  const reload=document.getElementById('reloadMap');reload.disabled=true;
  try {
    let events,links,revision=null,fallback=true;
    try {
      const response=await fetch('map-links.json',{cache:'no-store'});
      if (!response.ok) throw new Error('対応データを取得できません');
      links=await response.json();
      const {loadEventsData}=await import('./event-data.js');
      const result=await loadEventsData();
      events=result.data; revision=result.revision; fallback=result.source!=='firestore';
    } catch { /* Bundled data keeps the map available when the network fails. */ }
    if (!events || !links) ({events,links}=window.MAP_LOCAL_DATA || {});
    if (!events || !links) throw new Error('地図データを取得できません');
    applyData(events,links);
    status.classList.remove('error');
    status.textContent=fallback?'予備の催事情報を表示しています。最新の内容は会場でもご確認ください。':'公開中の催事情報を表示しています。';
    return revision;
  } catch {
    status.textContent='催事情報を取得できませんでした。通信を確認して再読み込みしてください。校内全体図は上のリンクから開けます。';status.classList.add('error');
  } finally {loading=false;reload.disabled=false;}
}
document.getElementById('reloadMap').addEventListener('click',loadMap);
// Show local map data before waiting for Firebase or CDN modules.
if (window.MAP_LOCAL_DATA) {
  try {applyData(window.MAP_LOCAL_DATA.events,window.MAP_LOCAL_DATA.links);status.textContent='保存済みの催事情報を表示しています。最新情報を確認しています…';} catch { /* loadMap reports data failures. */ }
}
loadMap().then(async revision => {
  try {
    const {watchEventsVersion}=await import('./event-data.js');
    stopEvents=watchEventsVersion(loadMap,revision);
  } catch { /* The local map remains available. */ }
});
try {
  const {watchCrowd}=await import('./crowd-firebase.js');
  watchCrowd((next,serverFresh) => {records=next;fresh=serverFresh;failed=false;updateCrowd();},() => {failed=true;fresh=false;updateCrowd();});
} catch {failed=true;updateCrowd();}
window.addEventListener('pagehide',event => { if (!event.persisted) stopEvents?.(); });
if ('serviceWorker' in navigator) window.addEventListener('load',() => navigator.serviceWorker.register('sw.js').catch(() => {}));
