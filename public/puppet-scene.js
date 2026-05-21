// Three.js сцена с марионетками для Cartoon Academy.
// Работает на десктопе и на мобильных (touch-события).
// Облегчённая версия рендеринга на маленьких/слабых устройствах.

(function () {
  'use strict';

  const canvas = document.getElementById('puppet-canvas');
  if (!canvas) return;

  // Уважаем prefers-reduced-motion — оставляем статический SVG fallback
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { canvas.style.display = 'none'; return; }
  if (typeof THREE === 'undefined') { canvas.style.display = 'none'; return; }

  // Определяем «мобильный режим» — узкий экран или touch-устройство
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const isMobile = window.matchMedia('(max-width: 820px)').matches;
  const lightMode = isMobile; // упрощённые материалы и освещение

  // ---------- Сцена ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !lightMode,
      powerPreference: lightMode ? 'low-power' : 'high-performance'
    });
  } catch (e) {
    canvas.style.display = 'none';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lightMode ? 1.5 : 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 0, 18);

  // Освещение
  const ambient = new THREE.AmbientLight(0x6a4a3a, lightMode ? 0.8 : 0.6);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffc88a, lightMode ? 1.0 : 1.2);
  keyLight.position.set(8, 12, 10);
  scene.add(keyLight);

  if (!lightMode) {
    const rimLight = new THREE.DirectionalLight(0x5a1325, 0.7);
    rimLight.position.set(-10, -4, 6);
    scene.add(rimLight);
  }

  const spot = new THREE.PointLight(0xe6c378, lightMode ? 1.0 : 1.5, 30);
  spot.position.set(0, 8, 8);
  scene.add(spot);

  // ---------- Материалы ----------
  const GOLD = 0xc8a560;
  const GOLD_BRIGHT = 0xe6c378;
  const DARK = 0x2a1620;
  const CRIMSON = 0x6a1830;

  // Lambert значительно быстрее на мобиле, чем Standard (нет PBR-расчёта)
  const Mat = lightMode ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  function matOpts(base) {
    if (lightMode) return { color: base.color };
    return base;
  }

  const mDark = new Mat(matOpts({ color: DARK, roughness: 0.85, metalness: 0.1 }));
  const mGold = new Mat(matOpts({ color: GOLD, roughness: 0.45, metalness: 0.6, emissive: 0x1a0a05, emissiveIntensity: 0.3 }));
  const mGoldBright = new Mat(matOpts({ color: GOLD_BRIGHT, roughness: 0.3, metalness: 0.7, emissive: 0x2a1610, emissiveIntensity: 0.5 }));
  const mString = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55 });

  // Сегменты геометрии — реже на мобиле
  const SEG = lightMode ? 0.6 : 1.0;
  const sphereSeg = (a, b) => [Math.max(8, Math.round(a * SEG)), Math.max(6, Math.round(b * SEG))];
  const cylSeg = (s) => Math.max(8, Math.round(s * SEG));

  // ---------- Рука кукловода ----------
  const handGroup = new THREE.Group();
  handGroup.position.set(0, 7.5, 0);
  scene.add(handGroup);

  const wrist = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, ...sphereSeg(32, 24)),
    mDark
  );
  wrist.scale.set(1.3, 0.9, 1);
  handGroup.add(wrist);

  const fingers = [];
  const fingerPositions = [
    { x: -1.3, len: 1.2, baseAngle: 0.4 },
    { x: -0.65, len: 1.4, baseAngle: 0.2 },
    { x: 0, len: 1.5, baseAngle: 0.0 },
    { x: 0.65, len: 1.4, baseAngle: -0.2 },
    { x: 1.3, len: 1.2, baseAngle: -0.4 }
  ];
  fingerPositions.forEach((cfg, i) => {
    const fg = new THREE.Group();
    fg.position.set(cfg.x, -0.5, 0);
    fg.rotation.z = cfg.baseAngle;

    const finger = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, cfg.len, cylSeg(12)),
      mDark
    );
    finger.position.y = -cfg.len / 2;
    fg.add(finger);

    const knuckle = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, ...sphereSeg(12, 10)),
      mGold
    );
    knuckle.position.y = -cfg.len + 0.05;
    fg.add(knuckle);

    handGroup.add(fg);
    fingers.push({ group: fg, baseAngle: cfg.baseAngle, phase: i * 0.7 });
  });

  function makeCrossbar(x) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, cylSeg(8)),
      mGold
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(x, -2.3, 0);
    handGroup.add(bar);
    return bar;
  }
  makeCrossbar(-5); makeCrossbar(0); makeCrossbar(5);

  // ---------- Куклы ----------
  function makeStringLine() {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -1, 0)
    ]);
    return new THREE.Line(geo, mString);
  }

  function makePuppet({ x, hatColor, headShape, hatType, suitColor }) {
    const root = new THREE.Group();
    root.position.set(x, -1, 0);

    const swing = new THREE.Group();
    root.add(swing);

    // === ГОЛОВА ===
    let head;
    if (headShape === 'sphere') {
      head = new THREE.Mesh(new THREE.SphereGeometry(0.85, ...sphereSeg(24, 20)), mDark);
    } else if (headShape === 'ellipse') {
      head = new THREE.Mesh(new THREE.SphereGeometry(0.85, ...sphereSeg(24, 20)), mDark);
      head.scale.set(0.95, 1.1, 1);
    } else {
      head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 1.3), mDark);
    }
    head.position.y = 0;
    swing.add(head);

    // === ГЛАЗА ===
    const eyeGeo = new THREE.SphereGeometry(0.11, ...sphereSeg(10, 8));
    const eyeL = new THREE.Mesh(eyeGeo, mGoldBright);
    const eyeR = new THREE.Mesh(eyeGeo, mGoldBright);
    eyeL.position.set(-0.27, 0.05, 0.7);
    eyeR.position.set(0.27, 0.05, 0.7);
    swing.add(eyeL);
    swing.add(eyeR);

    // === ШЛЯПА ===
    const hatMat = new Mat(matOpts({ color: hatColor, roughness: 0.7, metalness: 0.2 }));
    if (hatType === 'cylinder') {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.8, cylSeg(16)), hatMat);
      hat.position.y = 1.15;
      swing.add(hat);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, cylSeg(16)), mGold);
      brim.position.y = 0.78;
      swing.add(brim);
    } else if (hatType === 'cone') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.1, cylSeg(16)), hatMat);
      hat.position.y = 1.2;
      swing.add(hat);
      const pompom = new THREE.Mesh(new THREE.SphereGeometry(0.15, ...sphereSeg(12, 10)), mGoldBright);
      pompom.position.y = 1.85;
      swing.add(pompom);
    } else if (hatType === 'bow') {
      const bowL = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), hatMat);
      bowL.rotation.z = Math.PI / 2;
      bowL.position.set(-0.4, 0.95, 0);
      const bowR = bowL.clone();
      bowR.rotation.z = -Math.PI / 2;
      bowR.position.x = 0.4;
      swing.add(bowL); swing.add(bowR);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.18, ...sphereSeg(12, 10)), hatMat);
      knot.position.y = 0.95;
      swing.add(knot);
    }

    // === ТЕЛО ===
    const bodyMat = new Mat(matOpts({ color: suitColor, roughness: 0.7, metalness: 0.15 }));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 1.8, cylSeg(16)), bodyMat);
    body.position.y = -1.6;
    swing.add(body);

    // === РУКИ ===
    function makeLimb(x, baseAngle) {
      const limb = new THREE.Group();
      limb.position.set(x, -0.85, 0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.9, cylSeg(10)), mDark);
      upper.position.y = -0.45;
      limb.add(upper);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.17, ...sphereSeg(12, 10)), mGold);
      hand.position.y = -0.9;
      limb.add(hand);
      limb.rotation.z = baseAngle;
      return limb;
    }
    const armL = makeLimb(-0.55, 0.4);
    const armR = makeLimb(0.55, -0.4);
    swing.add(armL); swing.add(armR);

    // === НОГИ ===
    function makeLeg(x) {
      const leg = new THREE.Group();
      leg.position.set(x, -2.45, 0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, cylSeg(10)), mDark);
      upper.position.y = -0.5;
      leg.add(upper);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, ...sphereSeg(12, 10)), mGold);
      foot.scale.set(1.2, 0.5, 1.5);
      foot.position.y = -1.05;
      leg.add(foot);
      return leg;
    }
    swing.add(makeLeg(-0.3));
    swing.add(makeLeg(0.3));

    // === НИТИ ===
    const sHead = makeStringLine();
    const sHead2 = makeStringLine();
    const sArmL = makeStringLine();
    const sArmR = makeStringLine();
    [sHead, sHead2, sArmL, sArmR].forEach(s => scene.add(s));

    return {
      root, swing, head, armL, armR,
      strings: { head: sHead, head2: sHead2, armL: sArmL, armR: sArmR },
      phys: {
        rotZ: 0, rotZVel: 0,
        baseSwingPhase: Math.random() * Math.PI * 2,
        swingSpeed: 0.5 + Math.random() * 0.3,
        swingAmp: 0.06 + Math.random() * 0.04,
        offsetX: x
      }
    };
  }

  const puppets = [
    makePuppet({ x: -5, hatColor: CRIMSON, headShape: 'sphere', hatType: 'cylinder', suitColor: DARK }),
    makePuppet({ x: 0, hatColor: CRIMSON, headShape: 'ellipse', hatType: 'bow', suitColor: CRIMSON }),
    makePuppet({ x: 5, hatColor: CRIMSON, headShape: 'box', hatType: 'cone', suitColor: DARK })
  ];
  puppets.forEach(p => scene.add(p.root));

  // ---------- Указатель (мышь + тач) ----------
  const pointer = new THREE.Vector2(10000, 10000);
  const handTarget = new THREE.Vector2(0, 0);
  let pointerActive = false;
  let lastNudge = 0;

  function updatePointerFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) return false;
    if (clientX < rect.left || clientX > rect.right) return false;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    const distance = -camera.position.z / dir.z;
    const worldPos = camera.position.clone().add(dir.multiplyScalar(distance));
    pointer.set(worldPos.x, worldPos.y);

    // Усиление влияния на мобиле, чтобы рука уверенно реагировала
    const handGain = isMobile ? 0.55 : 0.4;
    handTarget.x = Math.max(-3.5, Math.min(3.5, worldPos.x * handGain));
    handTarget.y = 7.5 + Math.max(-1, Math.min(1.2, worldPos.y * 0.18));
    pointerActive = true;
    return true;
  }

  function nudgeNearby(impulse) {
    const now = performance.now();
    // На тач-устройствах ограничиваем частоту, чтобы не делало дёрганья как непрерывный процесс
    if (isTouch && now - lastNudge < 80) return;
    lastNudge = now;
    puppets.forEach(p => {
      const dx = pointer.x - p.phys.offsetX;
      const dist = Math.abs(dx) + Math.abs(pointer.y) * 0.5;
      if (dist < 2.8) {
        const force = (1 - dist / 2.8) * impulse;
        p.phys.rotZVel += -Math.sign(dx || 1) * force;
      }
    });
  }

  // Мышь
  window.addEventListener('mousemove', (ev) => {
    if (updatePointerFromClient(ev.clientX, ev.clientY)) nudgeNearby(0.6);
  }, { passive: true });
  window.addEventListener('mouseleave', () => {
    pointer.set(10000, 10000);
    handTarget.set(0, 7.5);
    pointerActive = false;
  });
  canvas.addEventListener('click', () => nudgeNearby(8));

  // Touch — реагируем на любые касания в зоне canvas, но не блокируем нативный скролл страницы
  function handleTouch(ev) {
    if (!ev.touches || ev.touches.length === 0) return;
    const t = ev.touches[0];
    if (updatePointerFromClient(t.clientX, t.clientY)) {
      nudgeNearby(ev.type === 'touchstart' ? 6 : 0.8);
    }
  }
  canvas.addEventListener('touchstart', handleTouch, { passive: true });
  canvas.addEventListener('touchmove', handleTouch, { passive: true });
  canvas.addEventListener('touchend', () => {
    handTarget.set(0, 7.5);
    pointerActive = false;
  }, { passive: true });

  // ---------- Resize ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // На узких экранах камера дальше — куклы должны влезать в кадр
    if (camera.aspect < 0.75) camera.position.z = 28;
    else if (camera.aspect < 1.2) camera.position.z = 22;
    else camera.position.z = 18;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  // На iOS Safari высота меняется при появлении/скрытии адресной строки
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));

  // ---------- Анимация ----------
  let lastTime = performance.now();
  let handX = 0, handY = 7.5;
  let frame = 0;

  function updateString(line, fromX, fromY, toX, toY) {
    const pts = line.geometry.attributes.position.array;
    pts[0] = fromX; pts[1] = fromY; pts[2] = 0;
    pts[3] = toX; pts[4] = toY; pts[5] = 0;
    line.geometry.attributes.position.needsUpdate = true;
  }

  function animate(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const t = now / 1000;

    handX += (handTarget.x - handX) * 0.04;
    handY += (handTarget.y - handY) * 0.04;
    handGroup.position.set(handX, handY, 0);
    handGroup.rotation.z = Math.sin(t * 0.7) * 0.05 + (handTarget.x - handX) * -0.05;

    fingers.forEach(f => {
      f.group.rotation.z = f.baseAngle + Math.sin(t * 1.5 + f.phase) * 0.12;
    });

    puppets.forEach((p, i) => {
      const ph = p.phys;
      const natural = Math.sin(t * ph.swingSpeed + ph.baseSwingPhase) * ph.swingAmp;
      const handPull = (handX - ph.offsetX) * 0.04;
      const target = natural + handPull;

      const stiffness = 4.5;
      const damping = 2.2;
      const force = (target - ph.rotZ) * stiffness - ph.rotZVel * damping;
      ph.rotZVel += force * dt;
      ph.rotZ += ph.rotZVel * dt;

      if (ph.rotZ > 0.45) { ph.rotZ = 0.45; ph.rotZVel *= -0.3; }
      if (ph.rotZ < -0.45) { ph.rotZ = -0.45; ph.rotZVel *= -0.3; }

      p.swing.rotation.z = ph.rotZ;

      const swayX = Math.sin(t * ph.swingSpeed * 0.5 + ph.baseSwingPhase) * 0.1;
      p.root.position.x = ph.offsetX + swayX;
      p.root.position.y = -1 + Math.sin(t * ph.swingSpeed * 1.2 + ph.baseSwingPhase) * 0.04;

      p.armL.rotation.z = 0.4 + Math.sin(t * 1.2 + i) * 0.1 + ph.rotZ * 0.4;
      p.armR.rotation.z = -0.4 + Math.cos(t * 1.2 + i) * 0.1 + ph.rotZ * 0.4;

      const handWorld = handGroup.position;
      const cbWorldX = handWorld.x + (ph.offsetX * 0.5);
      const cbWorldY = handWorld.y - 2.3;

      const headWorldX = p.root.position.x;
      const headWorldY = p.root.position.y + Math.cos(ph.rotZ) * 0.8;

      updateString(p.strings.head, cbWorldX - 0.6, cbWorldY, headWorldX - 0.5, headWorldY);
      updateString(p.strings.head2, cbWorldX + 0.6, cbWorldY, headWorldX + 0.5, headWorldY);

      const armLWorldX = p.root.position.x - 0.55 * Math.cos(ph.rotZ);
      const armRWorldX = p.root.position.x + 0.55 * Math.cos(ph.rotZ);
      const armWorldY = p.root.position.y - 1.7;
      updateString(p.strings.armL, cbWorldX - 1, cbWorldY, armLWorldX, armWorldY);
      updateString(p.strings.armR, cbWorldX + 1, cbWorldY, armRWorldX, armWorldY);
    });

    if (!lightMode) {
      spot.position.x = Math.sin(t * 0.3) * 4;
    }

    // На мобиле рендерим через кадр для экономии батареи (~30 FPS вместо 60)
    if (!lightMode || (frame & 1) === 0) {
      renderer.render(scene, camera);
    }
    frame++;
    requestAnimationFrame(animate);
  }

  try {
    requestAnimationFrame(animate);
    const fallback = document.querySelector('.puppet-stage');
    if (fallback) fallback.style.display = 'none';
  } catch (e) {
    console.error('Three.js animation failed:', e);
    canvas.style.display = 'none';
  }
})();
