// Three.js сцена с марионетками для Cartoon Academy.
// Запускается только при наличии WebGL и достаточной ширины экрана.
// При сбое инициализации canvas удаляется и виден SVG-fallback.

(function () {
  'use strict';

  const canvas = document.getElementById('puppet-canvas');
  if (!canvas) return;

  // Не запускаем на мобиле и при prefers-reduced-motion
  const isSmall = window.matchMedia('(max-width: 820px)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isSmall || reduced) {
    canvas.style.display = 'none';
    return;
  }

  if (typeof THREE === 'undefined') {
    canvas.style.display = 'none';
    return;
  }

  // ---------- Сцена ----------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 0, 18);

  // Освещение
  const ambient = new THREE.AmbientLight(0x6a4a3a, 0.6);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffc88a, 1.2);
  keyLight.position.set(8, 12, 10);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x5a1325, 0.7);
  rimLight.position.set(-10, -4, 6);
  scene.add(rimLight);

  const spot = new THREE.PointLight(0xe6c378, 1.5, 30);
  spot.position.set(0, 8, 8);
  scene.add(spot);

  // ---------- Материалы ----------
  const GOLD = 0xc8a560;
  const GOLD_BRIGHT = 0xe6c378;
  const DARK = 0x2a1620;
  const CRIMSON = 0x6a1830;

  const mDark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.85, metalness: 0.1 });
  const mCrimson = new THREE.MeshStandardMaterial({ color: CRIMSON, roughness: 0.7, metalness: 0.2 });
  const mGold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.45, metalness: 0.6, emissive: 0x1a0a05, emissiveIntensity: 0.3 });
  const mGoldBright = new THREE.MeshStandardMaterial({ color: GOLD_BRIGHT, roughness: 0.3, metalness: 0.7, emissive: 0x2a1610, emissiveIntensity: 0.5 });
  const mString = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55 });

  // ---------- Рука кукловода ----------
  const handGroup = new THREE.Group();
  handGroup.position.set(0, 7.5, 0);
  scene.add(handGroup);

  // Запястье (вытянутая сфера)
  const wrist = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 32, 24),
    mDark
  );
  wrist.scale.set(1.3, 0.9, 1);
  handGroup.add(wrist);

  // Пальцы
  const fingers = [];
  const fingerPositions = [
    { x: -1.3, len: 1.2, baseAngle: 0.4 },
    { x: -0.65, len: 1.4, baseAngle: 0.2 },
    { x: 0, len: 1.5, baseAngle: 0.0 },
    { x: 0.65, len: 1.4, baseAngle: -0.2 },
    { x: 1.3, len: 1.2, baseAngle: -0.4 }
  ];
  fingerPositions.forEach((cfg, i) => {
    const fingerGroup = new THREE.Group();
    fingerGroup.position.set(cfg.x, -0.5, 0);
    fingerGroup.rotation.z = cfg.baseAngle;

    const finger = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, cfg.len, 12),
      mDark
    );
    finger.position.y = -cfg.len / 2;
    fingerGroup.add(finger);

    // Сустав
    const knuckle = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      mGold
    );
    knuckle.position.y = -cfg.len + 0.05;
    fingerGroup.add(knuckle);

    handGroup.add(fingerGroup);
    fingers.push({ group: fingerGroup, baseAngle: cfg.baseAngle, phase: i * 0.7 });
  });

  // Крестовины (откуда идут нити к куклам)
  function makeCrossbar(x) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8),
      mGold
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(x, -2.3, 0);
    handGroup.add(bar);
    return bar;
  }
  const cross1 = makeCrossbar(-5);
  const cross2 = makeCrossbar(0);
  const cross3 = makeCrossbar(5);

  // ---------- Куклы ----------
  // Каждая кукла висит на 4-х нитях с двух крестовин.
  // У куклы есть собственный pendulum-state и интерактивность с мышью.

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

    // Свинг-узел: его вращаем для покачивания.
    const swing = new THREE.Group();
    root.add(swing);

    // === ГОЛОВА ===
    let head;
    if (headShape === 'sphere') {
      head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 20), mDark);
    } else if (headShape === 'ellipse') {
      head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 20), mDark);
      head.scale.set(0.95, 1.1, 1);
    } else { // box
      head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 1.3), mDark);
    }
    head.position.y = 0;
    swing.add(head);

    // === ГЛАЗА ===
    const eyeGeo = new THREE.SphereGeometry(0.11, 10, 8);
    const eyeL = new THREE.Mesh(eyeGeo, mGoldBright);
    const eyeR = new THREE.Mesh(eyeGeo, mGoldBright);
    eyeL.position.set(-0.27, 0.05, 0.7);
    eyeR.position.set(0.27, 0.05, 0.7);
    swing.add(eyeL);
    swing.add(eyeR);

    // === ШЛЯПА / БАНТ ===
    if (hatType === 'cylinder') {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 16), new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.7, metalness: 0.2 }));
      hat.position.y = 1.15;
      swing.add(hat);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 16), mGold);
      brim.position.y = 0.78;
      swing.add(brim);
    } else if (hatType === 'cone') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.1, 16), new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.7 }));
      hat.position.y = 1.2;
      swing.add(hat);
      const pompom = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mGoldBright);
      pompom.position.y = 1.85;
      swing.add(pompom);
    } else if (hatType === 'bow') {
      const bowMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.65 });
      const bowL = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), bowMat);
      bowL.rotation.z = Math.PI / 2;
      bowL.position.set(-0.4, 0.95, 0);
      const bowR = bowL.clone();
      bowR.rotation.z = -Math.PI / 2;
      bowR.position.x = 0.4;
      swing.add(bowL);
      swing.add(bowR);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), bowMat);
      knot.position.y = 0.95;
      swing.add(knot);
    }

    // === ТЕЛО ===
    const bodyMat = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.7, metalness: 0.15 });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.9, 1.8, 16),
      bodyMat
    );
    body.position.y = -1.6;
    swing.add(body);

    // === РУКИ ===
    function makeLimb(x, baseAngle) {
      const limb = new THREE.Group();
      limb.position.set(x, -0.85, 0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.9, 10), mDark);
      upper.position.y = -0.45;
      limb.add(upper);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mGold);
      hand.position.y = -0.9;
      limb.add(hand);
      limb.rotation.z = baseAngle;
      return limb;
    }
    const armL = makeLimb(-0.55, 0.4);
    const armR = makeLimb(0.55, -0.4);
    swing.add(armL);
    swing.add(armR);

    // === НОГИ ===
    function makeLeg(x) {
      const leg = new THREE.Group();
      leg.position.set(x, -2.45, 0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 10), mDark);
      upper.position.y = -0.5;
      leg.add(upper);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mGold);
      foot.scale.set(1.2, 0.5, 1.5);
      foot.position.y = -1.05;
      leg.add(foot);
      return leg;
    }
    const legL = makeLeg(-0.3);
    const legR = makeLeg(0.3);
    swing.add(legL);
    swing.add(legR);

    // === НИТИ ===
    // 4 нити: 2 идут к голове (от крестовины над куклой), 2 к рукам
    const stringFromHead = makeStringLine();
    const stringFromHead2 = makeStringLine();
    const stringFromArmL = makeStringLine();
    const stringFromArmR = makeStringLine();
    [stringFromHead, stringFromHead2, stringFromArmL, stringFromArmR].forEach(s => scene.add(s));

    return {
      root,
      swing,
      head,
      armL, armR,
      strings: { head: stringFromHead, head2: stringFromHead2, armL: stringFromArmL, armR: stringFromArmR },
      // Физическое состояние
      phys: {
        rotZ: 0,
        rotZVel: 0,
        baseSwingPhase: Math.random() * Math.PI * 2,
        swingSpeed: 0.5 + Math.random() * 0.3,
        swingAmp: 0.06 + Math.random() * 0.04,
        offsetX: x,
        crossbarX: x
      }
    };
  }

  const puppets = [
    makePuppet({ x: -5, hatColor: CRIMSON, headShape: 'sphere', hatType: 'cylinder', suitColor: DARK }),
    makePuppet({ x: 0, hatColor: CRIMSON, headShape: 'ellipse', hatType: 'bow', suitColor: CRIMSON }),
    makePuppet({ x: 5, hatColor: CRIMSON, headShape: 'box', hatType: 'cone', suitColor: DARK })
  ];
  puppets.forEach(p => scene.add(p.root));

  // ---------- Мышь и интерактив ----------
  const mouse = new THREE.Vector2(10000, 10000); // далеко вначале
  const mouseNDC = new THREE.Vector2();
  const handTarget = new THREE.Vector2(0, 0);

  window.addEventListener('mousemove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    if (ev.clientY < rect.top || ev.clientY > rect.bottom) return;
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    mouseNDC.set(nx, ny);
    // Конвертируем в мировые координаты на плоскости z=0
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    const distance = -camera.position.z / dir.z;
    const worldPos = camera.position.clone().add(dir.multiplyScalar(distance));
    mouse.set(worldPos.x, worldPos.y);

    // Рука движется к курсору, но с лимитом
    handTarget.x = Math.max(-3, Math.min(3, worldPos.x * 0.4));
    handTarget.y = 7.5 + Math.max(-1, Math.min(1, worldPos.y * 0.15));
  }, { passive: true });

  window.addEventListener('mouseleave', () => {
    mouse.set(10000, 10000);
    handTarget.set(0, 7.5);
  });

  // Импульс при наведении/клике на куклу
  function tryNudgePuppet(impulse) {
    puppets.forEach(p => {
      const dx = mouse.x - p.phys.offsetX;
      const dy = mouse.y - 0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 2.5) {
        // Сила импульса обратно пропорциональна расстоянию
        const force = (1 - dist / 2.5) * impulse;
        // Направление: куда от центра куклы
        p.phys.rotZVel += -Math.sign(dx) * force;
      }
    });
  }

  window.addEventListener('mousemove', () => tryNudgePuppet(0.6), { passive: true });
  canvas.addEventListener('click', () => tryNudgePuppet(8));

  // ---------- Resize ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Подгоняем frustum чтобы сцена влезала по ширине
    if (camera.aspect < 1.5) {
      camera.position.z = 22;
    } else {
      camera.position.z = 18;
    }
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- Анимация ----------
  let lastTime = performance.now();
  let handX = 0, handY = 7.5;

  function updateString(line, fromX, fromY, fromZ, toX, toY, toZ) {
    const pts = line.geometry.attributes.position.array;
    pts[0] = fromX; pts[1] = fromY; pts[2] = fromZ;
    pts[3] = toX; pts[4] = toY; pts[5] = toZ;
    line.geometry.attributes.position.needsUpdate = true;
  }

  function animate(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const t = now / 1000;

    // Движение руки (плавно к target)
    handX += (handTarget.x - handX) * 0.04;
    handY += (handTarget.y - handY) * 0.04;
    handGroup.position.set(handX, handY, 0);
    // Лёгкое естественное покачивание
    handGroup.rotation.z = Math.sin(t * 0.7) * 0.05 + (handTarget.x - handX) * -0.05;

    // Пальцы шевелятся
    fingers.forEach(f => {
      f.group.rotation.z = f.baseAngle + Math.sin(t * 1.5 + f.phase) * 0.12;
    });

    // Куклы
    puppets.forEach((p, i) => {
      const ph = p.phys;
      // Естественное покачивание (target)
      const natural = Math.sin(t * ph.swingSpeed + ph.baseSwingPhase) * ph.swingAmp;
      // Влияние руки: если рука сместилась, цели тоже смещаются
      const handPull = (handX - ph.offsetX) * 0.04;
      const target = natural + handPull;

      // Spring physics
      const stiffness = 4.5;
      const damping = 2.2;
      const force = (target - ph.rotZ) * stiffness - ph.rotZVel * damping;
      ph.rotZVel += force * dt;
      ph.rotZ += ph.rotZVel * dt;

      // Клипаем угол
      if (ph.rotZ > 0.45) { ph.rotZ = 0.45; ph.rotZVel *= -0.3; }
      if (ph.rotZ < -0.45) { ph.rotZ = -0.45; ph.rotZVel *= -0.3; }

      p.swing.rotation.z = ph.rotZ;

      // Позиция куклы (немного болтается по X)
      const swayX = Math.sin(t * ph.swingSpeed * 0.5 + ph.baseSwingPhase) * 0.1;
      p.root.position.x = ph.offsetX + swayX;
      p.root.position.y = -1 + Math.sin(t * ph.swingSpeed * 1.2 + ph.baseSwingPhase) * 0.04;

      // Руки шевелятся в такт
      p.armL.rotation.z = 0.4 + Math.sin(t * 1.2 + i) * 0.1 + ph.rotZ * 0.4;
      p.armR.rotation.z = -0.4 + Math.cos(t * 1.2 + i) * 0.1 + ph.rotZ * 0.4;

      // Обновить нити (мировые координаты)
      // Старт нити: точка на крестовине над куклой (в координатах handGroup → мировые)
      // Берём текущую x-позицию руки + смещение крестовины
      const crossbarLocalX = ph.offsetX; // условно фиксированная X у нити
      // Точки крепления на крестовине (мировые координаты)
      const handWorld = handGroup.position;
      const cbWorldX = handWorld.x + (ph.offsetX * 0.5); // нити сходятся к руке
      const cbWorldY = handWorld.y - 2.3;

      const headWorldX = p.root.position.x;
      const headWorldY = p.root.position.y + Math.cos(ph.rotZ) * 0.8;
      const headWorldZ = 0;

      updateString(p.strings.head, cbWorldX - 0.6, cbWorldY, 0, headWorldX - 0.5, headWorldY, 0);
      updateString(p.strings.head2, cbWorldX + 0.6, cbWorldY, 0, headWorldX + 0.5, headWorldY, 0);

      const armLWorldX = p.root.position.x - 0.55 * Math.cos(ph.rotZ);
      const armLWorldY = p.root.position.y - 1.7;
      const armRWorldX = p.root.position.x + 0.55 * Math.cos(ph.rotZ);
      const armRWorldY = p.root.position.y - 1.7;

      updateString(p.strings.armL, cbWorldX - 1, cbWorldY, 0, armLWorldX, armLWorldY, 0);
      updateString(p.strings.armR, cbWorldX + 1, cbWorldY, 0, armRWorldX, armRWorldY, 0);
    });

    // Точечный свет покачивается
    spot.position.x = Math.sin(t * 0.3) * 4;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  try {
    requestAnimationFrame(animate);
    // Если успешно — скрываем SVG-fallback
    const fallback = document.querySelector('.puppet-stage');
    if (fallback) fallback.style.display = 'none';
  } catch (e) {
    console.error('Three.js animation failed:', e);
    canvas.style.display = 'none';
  }
})();
