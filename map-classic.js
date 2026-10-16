
  const mapWrap = document.getElementById('mapWrap');
  const mapViewport = document.getElementById('mapViewport');
  const mapStatus = document.getElementById('mapStatus');
  const sheet = document.getElementById('detailSheet');
  const sheetTitle = document.getElementById('sheetTitle');
  const sheetEvents = document.getElementById('sheetEvents');
  const closeButton = document.getElementById('sheetClose');
  let activePin = null;
  const baseMapWidth = 1400;
  const maxZoom = 2.5;
  const zoomOutButton = document.getElementById('zoomOut');
  const zoomInButton = document.getElementById('zoomIn');
  const zoomFitButton = document.getElementById('zoomFit');
  const zoomLevel = document.getElementById('zoomLevel');
  let zoom = 1;
  let pinch = null;

  function minZoom() {
    return Math.min(1, mapViewport.clientWidth / baseMapWidth);
  }
  function updateZoomControls() {
    zoomLevel.value = `${Math.round(zoom * 100)}%`;
    zoomOutButton.disabled = zoom <= minZoom() + .001;
    zoomInButton.disabled = zoom >= maxZoom - .001;
    zoomFitButton.disabled = zoom <= minZoom() + .001;
  }
  function setZoom(next, clientX, clientY) {
    const rect = mapViewport.getBoundingClientRect();
    const x = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const y = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const oldZoom = zoom;
    zoom = Math.min(maxZoom, Math.max(minZoom(), next));
    if (Math.abs(zoom - oldZoom) < .001) return;
    const contentX = mapViewport.scrollLeft + x;
    const contentY = mapViewport.scrollTop + y;
    mapWrap.style.width = `${baseMapWidth * zoom}px`;
    mapWrap.style.setProperty('--pin-scale', Math.min(1, zoom));
    mapViewport.scrollTo({
      left: contentX * zoom / oldZoom - x,
      top: contentY * zoom / oldZoom - y,
      behavior: 'auto'
    });
    updateZoomControls();
  }
  zoomOutButton.addEventListener('click', () => setZoom(zoom / 1.25));
  zoomInButton.addEventListener('click', () => setZoom(zoom * 1.25));
  zoomFitButton.addEventListener('click', () => {
    setZoom(minZoom());
    mapViewport.scrollTo({left: 0, top: 0, behavior: 'auto'});
  });
  mapViewport.addEventListener('touchstart', event => {
    if (event.touches.length !== 2) { pinch = null; return; }
    const [a, b] = event.touches;
    pinch = {distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom};
  }, {passive: true});
  mapViewport.addEventListener('touchmove', event => {
    if (event.touches.length !== 2 || !pinch) return;
    event.preventDefault();
    const [a, b] = event.touches;
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    setZoom(pinch.zoom * distance / pinch.distance, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  }, {passive: false});
  mapViewport.addEventListener('touchend', event => { if (event.touches.length < 2) pinch = null; });
  mapViewport.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(zoom * Math.exp(-event.deltaY / 300), event.clientX, event.clientY);
  }, {passive: false});
  window.addEventListener('resize', () => {
    if (zoom < minZoom()) setZoom(minZoom());
    updateZoomControls();
  });
  updateZoomControls();

  function closeSheet() {
    sheet.hidden = true;
    if (activePin) {
      activePin.classList.remove('active');
      activePin.focus();
    }
    activePin = null;
  }
  closeButton.addEventListener('click', closeSheet);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !sheet.hidden) closeSheet();
  });

  async function loadMap() {
    try {
      let events, links, positions, revision = null;
      let usingFallback = location.protocol === 'file:';
      if (!usingFallback) {
        try {
          const files = ['map-links.json', 'map-positions.json'];
          const responses = await Promise.all(files.map(file => fetch(file, {cache: 'no-store'})));
          if (responses.some(response => !response.ok)) throw new Error('地図データを取得できませんでした');
          [links, positions] = await Promise.all(responses.map(response => response.json()));
          const {loadEventsData} = await import('./event-data.js');
          const result = await loadEventsData();
          ({data: events, revision} = result);
          usingFallback = result.source !== 'firestore';
        } catch {
          usingFallback = true;
        }
      }
      if (usingFallback) ({events, links, positions} = window.MAP_LOCAL_DATA || {});
      if (!events || !links || !positions) throw new Error('地図データを取得できませんでした');
      if (!sheet.hidden) closeSheet();
      mapWrap.querySelectorAll('.map-pin').forEach(pin => pin.remove());
      const eventById = new Map(Object.values(events).flatMap(zone => zone.items || []).map(item => [item.id, item]));
      const keys = [...Array.from({length: 39}, (_, index) => String(index + 1)), 'gymB', 'gymA'];
      for (const key of keys) {
        const position = positions[key];
        const markerNumber = Number(key);
        const isClassroom = Number.isInteger(markerNumber) && markerNumber >= 1 && markerNumber <= 24;
        const floor = isClassroom ? Math.floor((markerNumber - 1) / 8) + 1 : null;
        const roomIndex = isClassroom ? ((markerNumber - 1) % 8) + 1 : null;
        const roomName = isClassroom ? `${floor}${String(roomIndex).padStart(2, '0')}教室` : null;
        const eventIds = links[key];
        if (!position || !Array.isArray(eventIds)) throw new Error(`地図番号${key}の対応データを確認してください`);
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = `map-pin ${/^\d+$/.test(key) ? 'number' : 'venue'}`;
        pin.textContent = roomName ? roomName.replace('教室', '') : position.label || key;
        pin.setAttribute('aria-label', roomName ? `${roomName}の催事を見る` : position.label ? `${position.label}の催事を見る` : `${key}番の催事を見る`);
        pin.style.left = `${position.x}%`;
        pin.style.top = `${position.y}%`;
        pin.addEventListener('click', () => {
          if (activePin) activePin.classList.remove('active');
          activePin = pin;
          pin.classList.add('active');
          sheetTitle.textContent = roomName || position.label || `地図番号 ${key}`;
          sheetEvents.replaceChildren();
          for (const id of eventIds) {
            const item = eventById.get(id);
            if (!item) continue;
            if (item.name === '（なし）') continue;
            const card = document.createElement('article');
            card.className = 'event';
            const name = document.createElement('h3');
            name.textContent = item.name;
            card.append(name);
            if (item.room || item.time) {
              const meta = document.createElement('p');
              meta.className = 'meta';
              meta.textContent = [item.room, item.time].filter(Boolean).join(' ・ ');
              card.append(meta);
            }
            if (item.desc) {
              const desc = document.createElement('p');
              desc.textContent = item.desc;
              card.append(desc);
            }
            sheetEvents.append(card);
          }
          if (!sheetEvents.children.length) {
            const empty = document.createElement('p');
            empty.textContent = '現在、この場所に催事はありません。';
            sheetEvents.append(empty);
          }
          if (key === 'gymA' || key === 'gymB') {
            const more = document.createElement('a');
            more.className = 'more-link';
            more.href = 'taiikukan.html';
            more.textContent = '体育館の特別催事を見る →';
            sheetEvents.append(more);
          }
          sheet.hidden = false;
          closeButton.focus();
        });
        mapWrap.append(pin);
      }
      function jumpTo(key, behavior = 'smooth') {
        const position = positions[key];
        if (zoom < 1) setZoom(1);
        mapViewport.scrollTo({
          left: mapWrap.clientWidth * position.x / 100 - mapViewport.clientWidth / 2,
          top: mapWrap.clientHeight * position.y / 100 - mapViewport.clientHeight / 2,
          behavior
        });
      }
      document.querySelectorAll('[data-jump]').forEach(button => { button.onclick = () => jumpTo(button.dataset.jump); });
      await document.querySelector('.map-image').decode().catch(() => {});
      jumpTo('12', 'auto');
      mapStatus.textContent = usingFallback
        ? '予備データを表示しています。教室番号・地図番号・体育館名をタップできます。'
        : '教室番号・地図番号・体育館名をタップして詳細を見られます。';
      return revision;
    } catch (error) {
      mapStatus.textContent = '地図の催事情報を読み込めませんでした。通信を確認して再読み込みしてください。';
      mapStatus.classList.add('error');
    }
  }
  loadMap().then(async revision => {
    if (location.protocol === 'file:') return;
    try {
      const {watchEventsVersion} = await import('./event-data.js');
      watchEventsVersion(() => loadMap(), revision);
    } catch {}
  });
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
