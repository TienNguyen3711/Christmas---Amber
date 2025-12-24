// magic.js (FULL REPLACE)
// HEART gesture: particle-morph to 5 cutout PNGs (13.png..17.png), revealed sequentially every 0.5s
// TREE / EXPLODE / PHOTO flow kept (using photoFiles)
// NOTE: put 13.png..17.png next to this file

(() => {
    // =========================
    // 1) RESOURCES CONFIG
    // =========================
    const MUSIC_URL = "./audio.mp3";
    let bgMusic = null;

    const loader = new THREE.TextureLoader();

    // Existing photos (for EXPLODE/PHOTO orbit)
    const photoFiles = ["./image1.jpeg", "./image2.jpeg", "./image3.jpeg", "./image4.jpeg", "./image5.jpeg"];
    const photoTextures = photoFiles.map((f) => loader.load(f));

    // HEART gallery PNG cutouts (for particle-image morph)
    // default set; can be replaced at runtime by uploaded images
    let heartFiles = ["./13.png"];
    let uploadedImages = [];

    function getGalleryImageCount() {
        return Math.max(1, heartFiles.length);
    }

    function createCustomTexture(type) {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext("2d");
        const cx = 64, cy = 64;

        if (type === "gold_glow") {
            const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
            grd.addColorStop(0, "#FFFFFF");
            grd.addColorStop(0.2, "#FFFFE0");
            grd.addColorStop(0.5, "#FFD700");
            grd.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
        } else if (type === "red_light") {
            const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50);
            grd.addColorStop(0, "#FFAAAA");
            grd.addColorStop(0.3, "#FF0000");
            grd.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
        } else if (type === "gift_red") {
            ctx.fillStyle = "#D32F2F"; ctx.fillRect(20, 20, 88, 88);
            ctx.fillStyle = "#FFD700";
            ctx.fillRect(54, 20, 20, 88);
            ctx.fillRect(20, 54, 88, 20);
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 2;
            ctx.strokeRect(20, 20, 88, 88);
        }
        return new THREE.CanvasTexture(canvas);
    }

    const textures = {
        gold: createCustomTexture("gold_glow"),
        red: createCustomTexture("red_light"),
        gift: createCustomTexture("gift_red"),
    };

    // =========================
    // 2) SYSTEM CONFIG
    // =========================
    const CONFIG = {
        goldCount: 2000,
        redCount: 300,
        giftCount: 150,

        explodeRadius: 65,
        photoOrbitRadius: 25,

        treeHeight: 70,
        treeBaseRadius: 35,

        // HEART gallery particle config
        galleryCount: 128000,         // more points => clearer images (increase for sharpness)
        gallerySize: 2.0,
        galleryZJitter: 0.0,
        revealStepMs: 500,           // 0.5s each image
        alphaThreshold: 8,           // PNG alpha threshold
        pixelStep: 1,                // scan stride (1 = highest fidelity, slower)
        pad: 6,                      // crop pad

        // Layout: 5 images across center
        galleryY: 0,
        gallerySpacing: 20,          // distance between images
        galleryScale: 0.15,          // pixel-to-world scale (tune if too big/small)
    };

    let scene, camera, renderer;
    let groupGold, groupRed, groupGift;
    let groupGallery = null;

    let photoMeshes = [];
    let titleMesh, starMesh, loveMesh, msgMesh;

    let state = "TREE"; // TREE | EXPLODE | PHOTO | HEART
    let selectedIndex = 0;
    let handX = 0.5;

    let started = false;

    // HEART gallery sequencing
    let galleryReady = false;
    let galleryRevealCount = 0; // 0..5
    let galleryTimer = null;
    let galleryBuilding = false;
    let msgShown = false; // lock to prevent blinking once message is displayed

    // =========================
    // 3) HELPERS (image -> points)
    // =========================
    function cropAlphaBounds(img, alphaThreshold = 10, pad = 8, pixelStep = 2) {
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d", { willReadFrequently: true });
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);

        let minX = width, minY = height, maxX = -1, maxY = -1;

        for (let y = 0; y < height; y += pixelStep) {
            for (let x = 0; x < width; x += pixelStep) {
                const a = data[(y * width + x) * 4 + 3];
                if (a > alphaThreshold) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < 0) {
            return { canvas: c, bounds: { x: 0, y: 0, w: width, h: height }, data, width, height };
        }

        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(width - 1, maxX + pad);
        maxY = Math.min(height - 1, maxY + pad);

        const w = maxX - minX + 1;
        const h = maxY - minY + 1;

        // crop to new canvas
        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        const octx = out.getContext("2d", { willReadFrequently: true });
        octx.drawImage(c, minX, minY, w, h, 0, 0, w, h);

        const id = octx.getImageData(0, 0, w, h);
        return { canvas: out, bounds: { x: 0, y: 0, w, h }, data: id.data, width: w, height: h };
    }

    async function imageToPointTargets(url, count, centerX, centerY) {
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.crossOrigin = "anonymous";
            let triedAlt = false;
            im.onload = () => resolve(im);
            im.onerror = (e) => {
                console.error("Image load failed:", url, e);
                if (!triedAlt && !url.startsWith("./") && !url.startsWith("/")) {
                    triedAlt = true;
                    im.src = "./" + url;
                    return;
                }
                reject(new Error("Failed to load image: " + url));
            };
            im.src = url;
        });

        const { data, width, height } = cropAlphaBounds(
            img,
            CONFIG.alphaThreshold,
            CONFIG.pad,
            CONFIG.pixelStep
        );

        // collect opaque pixels
        const pts = [];
        for (let y = 0; y < height; y += CONFIG.pixelStep) {
            for (let x = 0; x < width; x += CONFIG.pixelStep) {
                const a = data[(y * width + x) * 4 + 3];
                if (a > CONFIG.alphaThreshold) pts.push([x, y]);
            }
        }

        // fallback: if too few, just scatter a rect
        const useFallback = pts.length < 50;

        const targets = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            let px, py;

            if (!useFallback) {
                const pick = pts[(Math.random() * pts.length) | 0];
                px = pick[0];
                py = pick[1];
            } else {
                px = Math.random() * width;
                py = Math.random() * height;
            }

            // map pixels -> world coords (centered)
            const x = (px - width / 2) * CONFIG.galleryScale + centerX;
            const y = (height / 2 - py) * CONFIG.galleryScale + centerY;
            const z = (Math.random() - 0.5) * CONFIG.galleryZJitter;

            targets[i * 3 + 0] = x;
            targets[i * 3 + 1] = y;
            targets[i * 3 + 2] = z;

            // sample color at pixel from cropped image data
            const di = (Math.floor(py) * width + Math.floor(px)) * 4;
            const r = data[di] / 255;
            const g = data[di + 1] / 255;
            const b = data[di + 2] / 255;
            colors[i * 3 + 0] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }

        return { targets, colors };
    }

    function randomCloudTargets(count, spread = 120) {
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            // random sphere-ish
            const u = Math.random();
            const v = Math.random();
            const phi = Math.acos(2 * v - 1);
            const lam = 2 * Math.PI * u;
            const rad = spread * Math.cbrt(Math.random());

            arr[i * 3 + 0] = rad * Math.sin(phi) * Math.cos(lam);
            arr[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(lam);
            arr[i * 3 + 2] = rad * Math.cos(phi);
        }
        return arr;
    }

    // =========================
    // 4) THREE.JS
    // =========================
    function getContainer() {
        return document.getElementById("canvas-container");
    }

    function resizeToContainer() {
        const container = getContainer();
        if (!container || !renderer || !camera) return;

        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        // update drawing buffer and CSS size so canvas matches container exactly
        renderer.setSize(w, h, true);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function init3D() {
        const container = getContainer();
        if (!container) return;

        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x000000, 0.002);

        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;

        camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1400);
        camera.position.z = 110;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // set size and style so canvas fills the container and stays centered
        renderer.setSize(w, h, true);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';
        container.appendChild(renderer.domElement);

        groupGold = createParticleSystem("gold", CONFIG.goldCount, 2.0);
        groupRed = createParticleSystem("red", CONFIG.redCount, 3.5);
        groupGift = createParticleSystem("gift", CONFIG.giftCount, 3.0);

        createPhotos();
        createDecorations();

        // Create gallery points (initially hidden)
        createGalleryPoints();

        resizeToContainer();
        animate();
    }

    function createParticleSystem(type, count, size) {
        const pPositions = [];
        const pExplodeTargets = [];
        const pTreeTargets = [];
        const pHeartTargets = [];
        const sizes = [];
        const phases = [];

        for (let i = 0; i < count; i++) {
            // TREE targets
            const h = Math.random() * CONFIG.treeHeight;
            const y = h - CONFIG.treeHeight / 2;
            const radiusRatio = (type === "gold") ? Math.sqrt(Math.random()) : 0.9 + Math.random() * 0.1;
            const maxR = (1 - (h / CONFIG.treeHeight)) * CONFIG.treeBaseRadius;
            const r = maxR * radiusRatio;
            const theta = Math.random() * Math.PI * 2;
            pTreeTargets.push(r * Math.cos(theta), y, r * Math.sin(theta));

            // EXPLODE targets
            const u = Math.random();
            const v = Math.random();
            const phi = Math.acos(2 * v - 1);
            const lam = 2 * Math.PI * u;
            const radMult = (type === "gift") ? 1.2 : 1.0;
            const rad = CONFIG.explodeRadius * Math.cbrt(Math.random()) * radMult;
            pExplodeTargets.push(
                rad * Math.sin(phi) * Math.cos(lam),
                rad * Math.sin(phi) * Math.sin(lam),
                rad * Math.cos(phi)
            );

            // HEART (kept as vibe, but we won't show love text anymore)
            const tHeart = Math.random() * Math.PI * 2;
            let hx = 16 * Math.pow(Math.sin(tHeart), 3);
            let hy = 13 * Math.cos(tHeart) - 5 * Math.cos(2 * tHeart) - 2 * Math.cos(3 * tHeart) - Math.cos(4 * tHeart);

            const rFill = Math.pow(Math.random(), 0.3);
            hx *= rFill; hy *= rFill;
            let hz = (Math.random() - 0.5) * 8 * rFill;

            const noise = 1.0;
            hx += (Math.random() - 0.5) * noise;
            hy += (Math.random() - 0.5) * noise;
            hz += (Math.random() - 0.5) * noise;

            const scaleH = 2.2;
            pHeartTargets.push(hx * scaleH, hy * scaleH + 5, hz);

            // init positions = tree
            pPositions.push(pTreeTargets[i * 3], pTreeTargets[i * 3 + 1], pTreeTargets[i * 3 + 2]);
            sizes.push(size);
            phases.push(Math.random() * Math.PI * 2);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pPositions, 3));
        geo.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

        const colors = new Float32Array(count * 3);
        const baseColor = new THREE.Color();
        if (type === "gold") baseColor.setHex(0xFFD700);
        else if (type === "red") baseColor.setHex(0xFF0000);
        else baseColor.setHex(0xFFFFFF);

        for (let i = 0; i < count; i++) {
            colors[i * 3] = baseColor.r;
            colors[i * 3 + 1] = baseColor.g;
            colors[i * 3 + 2] = baseColor.b;
        }
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        geo.userData = {
            tree: pTreeTargets,
            explode: pExplodeTargets,
            heart: pHeartTargets,
            phases,
            baseColor,
            baseSize: size,
        };

        const mat = new THREE.PointsMaterial({
            size,
            map: textures[type],
            transparent: true,
            opacity: 1.0,
            vertexColors: true,
            blending: (type === "gift") ? THREE.NormalBlending : THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        const points = new THREE.Points(geo, mat);
        scene.add(points);
        return points;
    }

    // Existing photos for EXPLODE/PHOTO
    function createPhotos() {
        // Create each photo plane sized to the texture's aspect ratio
        const borderMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });

        const baseHeight = 8; // consistent reference height for all photos
        for (let i = 0; i < 5; i++) {
            const tex = photoTextures[i];
            // try to read actual image dimensions; fallback to square
            const img = tex && tex.image ? tex.image : { width: 1, height: 1 };
            const iw = img.width || 1;
            const ih = img.height || 1;
            const aspect = iw / ih;

            const width = baseHeight * aspect;
            const height = baseHeight;

            const geo = new THREE.PlaneGeometry(width, height);
            const borderGeo = new THREE.PlaneGeometry(width + 1, height + 1);

            // ensure texture filtering gives a cleaner look when scaled
            if (tex) {
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.needsUpdate = true;
            }

            const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geo, mat);
            const border = new THREE.Mesh(borderGeo, borderMat);
            border.position.z = -0.1;
            mesh.add(border);

            mesh.visible = false;
            mesh.scale.set(0, 0, 0);
            scene.add(mesh);
            photoMeshes.push(mesh);
        }
    }

    function createDecorations() {
        // Title: MERRY CHRISTMAS
        const canvas = document.createElement("canvas");
        canvas.width = 1024; canvas.height = 256;
        const ctx = canvas.getContext("2d");
        ctx.font = 'bold italic 90px "Times New Roman"';
        ctx.fillStyle = "#FFD700";
        ctx.textAlign = "center";
        ctx.shadowColor = "#FF0000";
        ctx.shadowBlur = 40;
        ctx.fillText("MERRY CHRISTMAS", 512, 130);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending });
        titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 15), mat);
        titleMesh.position.set(0, 55, 0);
        scene.add(titleMesh);

        // Star
        const starCanvas = document.createElement("canvas");
        starCanvas.width = 128; starCanvas.height = 128;
        const sCtx = starCanvas.getContext("2d");
        sCtx.fillStyle = "#FFFF00";
        sCtx.shadowColor = "#FFF";
        sCtx.shadowBlur = 20;
        sCtx.beginPath();
        const cx = 64, cy = 64, outer = 50, inner = 20;
        for (let i = 0; i < 5; i++) {
            sCtx.lineTo(cx + Math.cos((18 + i * 72) / 180 * Math.PI) * outer, cy - Math.sin((18 + i * 72) / 180 * Math.PI) * outer);
            sCtx.lineTo(cx + Math.cos((54 + i * 72) / 180 * Math.PI) * inner, cy - Math.sin((54 + i * 72) / 180 * Math.PI) * inner);
        }
        sCtx.closePath(); sCtx.fill();
        const starTex = new THREE.CanvasTexture(starCanvas);
        const starMat = new THREE.MeshBasicMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending });
        starMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), starMat);
        starMesh.position.set(0, CONFIG.treeHeight / 2 + 2, 0);
        scene.add(starMesh);

        // Old love mesh (kept but never shown)
        const loveCanvas = document.createElement("canvas");
        loveCanvas.width = 1024; loveCanvas.height = 256;
        const lCtx = loveCanvas.getContext("2d");
        lCtx.font = 'bold 120px "Segoe UI", sans-serif';
        lCtx.fillStyle = "#FF69B4";
        lCtx.textAlign = "center";
        lCtx.shadowColor = "#FF1493";
        lCtx.shadowBlur = 40;
        lCtx.fillText("I LOVE YOU ❤️", 512, 130);
        const loveTex = new THREE.CanvasTexture(loveCanvas);
        const loveMat = new THREE.MeshBasicMaterial({ map: loveTex, transparent: true, blending: THREE.AdditiveBlending });
        loveMesh = new THREE.Mesh(new THREE.PlaneGeometry(70, 18), loveMat);
        loveMesh.position.set(0, 0, 20);
        loveMesh.visible = false;
        scene.add(loveMesh);

        // Message after 5 images done
        msgMesh = makeTextMesh("FOR AMBER", 70, "#FFFFFF", "#FFD700");
        msgMesh.position.set(0, -42, 0);
        msgMesh.visible = false;
        scene.add(msgMesh);
    }

    function makeTextMesh(text, w = 70, fill = "#FFFFFF", glow = "#FFD700") {
        const c = document.createElement("canvas");
        c.width = 1024; c.height = 256;
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.font = '900 120px "Segoe UI", system-ui';
        ctx.textAlign = "center";
        ctx.fillStyle = fill;
        ctx.shadowColor = glow;
        ctx.shadowBlur = 30;
        ctx.fillText(text, 512, 150);
        const tex = new THREE.CanvasTexture(c);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending });
        return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.22), mat);
    }

    // =========================
    // 4.1) HEART GALLERY POINTS
    // =========================
    function createGalleryPoints() {
        const count = CONFIG.galleryCount;

        const pos = new Float32Array(count * 3);
        const size = new Float32Array(count);
        const col = new Float32Array(count * 3);

        // init: scattered & invisible
        const scatter = randomCloudTargets(count, 140);
        pos.set(scatter);
        for (let i = 0; i < count; i++) size[i] = 0.0;

        const base = new THREE.Color(0xFFD700);
        for (let i = 0; i < count; i++) {
            col[i * 3 + 0] = base.r;
            col[i * 3 + 1] = base.g;
            col[i * 3 + 2] = base.b;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

        // userData will be filled after building targets from images
        geo.userData = {
            scatterTargets: scatter,
            finalTargets: new Float32Array(count * 3), // per-particle final target (assigned to an image)
            imageIndex: new Uint8Array(count),         // 0..4
            ready: false,
        };

        const mat = new THREE.PointsMaterial({
            size: CONFIG.gallerySize,
            map: textures.gold,
            transparent: true,
            opacity: 1.0,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        groupGallery = new THREE.Points(geo, mat);
        groupGallery.visible = false;
        scene.add(groupGallery);
    }

    async function buildGalleryTargets() {
        if (!groupGallery || galleryBuilding) return;
        galleryBuilding = true;

        const count = CONFIG.galleryCount;
        const geo = groupGallery.geometry;
        console.log("▶ buildGalleryTargets START", heartFiles);


        try {
            // assign each particle to one of N images evenly
            const nImages = getGalleryImageCount();
            const per = Math.floor(count / nImages);
            for (let i = 0; i < count; i++) {
                const idx = Math.min(nImages - 1, Math.floor(i / per));
                geo.userData.imageIndex[i] = idx;
            }

            // centers for N images across (centered)
            const centers = [];
            const startX = -CONFIG.gallerySpacing * ((nImages - 1) / 2);
            for (let i = 0; i < nImages; i++) {
                centers.push({ x: startX + i * CONFIG.gallerySpacing, y: CONFIG.galleryY });
            }

            // build per-image targets then write into finalTargets by particle assignment
            const finalTargets = geo.userData.finalTargets;

            for (let imgIdx = 0; imgIdx < nImages; imgIdx++) {
                const begin = imgIdx * per;
                const end = (imgIdx === nImages - 1) ? count : (imgIdx + 1) * per;
                const partCount = end - begin;

                // load points and colors from image (dataURL or path)
                const src = heartFiles[imgIdx];
                const res = await imageToPointTargets(src, partCount, centers[imgIdx].x, centers[imgIdx].y);
                const t = res.targets;
                const c = res.colors;

                // write positions
                for (let j = 0; j < partCount; j++) {
                    const p = begin + j;
                    finalTargets[p * 3 + 0] = t[j * 3 + 0];
                    finalTargets[p * 3 + 1] = t[j * 3 + 1];
                    finalTargets[p * 3 + 2] = t[j * 3 + 2];
                }

                // write colors into geometry color buffer
                const colArr = geo.attributes.color.array;
                for (let j = 0; j < partCount; j++) {
                    const p = begin + j;
                    colArr[p * 3 + 0] = c[j * 3 + 0];
                    colArr[p * 3 + 1] = c[j * 3 + 1];
                    colArr[p * 3 + 2] = c[j * 3 + 2];
                }
            }

            geo.userData.ready = true;
            galleryReady = true;

            console.log("✅ HEART gallery ready:", heartFiles);

        } catch (e) {
            console.error("❌ HEART gallery load failed:", e);
            console.error("heartFiles =", heartFiles);
            galleryReady = false;
            geo.userData.ready = false;

        } finally {
            galleryBuilding = false;
        }
    }

    function startGallerySequence() {
        if (galleryTimer) return;

        // ✅ cho hiện ảnh đầu tiên ngay lập tức
        galleryRevealCount = 1;
        msgMesh.visible = false;
        msgShown = false;

        galleryTimer = setInterval(() => {
            galleryRevealCount++;
            const total = getGalleryImageCount();
            if (galleryRevealCount >= total) {
                galleryRevealCount = total;
                clearInterval(galleryTimer);
                galleryTimer = null;

                setTimeout(() => {
                    if (state === "HEART") {
                        msgMesh.visible = true;
                        msgShown = true;
                    }
                }, 350);
            }
        }, CONFIG.revealStepMs);
    }

    function stopGallerySequence() {
        if (galleryTimer) {
            clearInterval(galleryTimer);
            galleryTimer = null;
        }
        galleryRevealCount = 0;
        msgMesh.visible = false;
    }


    // =========================
    // 4.2) UPDATE / ANIMATE
    // =========================
    function updateParticleGroup(group, type, targetState, speed, handRotY, time) {
        const positions = group.geometry.attributes.position.array;
        const sizes = group.geometry.attributes.size.array;
        const colors = group.geometry.attributes.color.array;
        const phases = group.geometry.userData.phases;
        const baseColor = group.geometry.userData.baseColor;
        const baseSize = group.geometry.userData.baseSize;

        const targetKey = (targetState === "TREE") ? "tree" : (targetState === "HEART" ? "heart" : "explode");
        const targets = group.geometry.userData[(targetState === "PHOTO") ? "explode" : targetKey];

        for (let i = 0; i < positions.length; i++) {
            positions[i] += (targets[i] - positions[i]) * speed;
        }
        group.geometry.attributes.position.needsUpdate = true;

        const count = positions.length / 3;

        if (targetState === "TREE") {
            group.rotation.y += 0.003;

            for (let i = 0; i < count; i++) {
                sizes[i] = baseSize;
                let brightness = 1.0;
                if (type === "red") brightness = 0.5 + 0.5 * Math.sin(time * 3 + phases[i]);
                else if (type === "gold") brightness = 0.8 + 0.4 * Math.sin(time * 10 + phases[i]);

                colors[i * 3] = baseColor.r * brightness;
                colors[i * 3 + 1] = baseColor.g * brightness;
                colors[i * 3 + 2] = baseColor.b * brightness;
            }
            group.geometry.attributes.color.needsUpdate = true;
            group.geometry.attributes.size.needsUpdate = true;

        } else if (targetState === "HEART") {
            // keep "heart-shaped particle vibe" very subtle in background
            group.rotation.y = 0;
            const beatScale = 1 + Math.abs(Math.sin(time * 3)) * 0.08;
            group.scale.set(beatScale, beatScale, beatScale);

            for (let i = 0; i < count; i++) {
                colors[i * 3] = baseColor.r;
                colors[i * 3 + 1] = baseColor.g;
                colors[i * 3 + 2] = baseColor.b;
                sizes[i] = (i % 5 === 0) ? baseSize * 0.6 : 0;
            }
            group.geometry.attributes.color.needsUpdate = true;
            group.geometry.attributes.size.needsUpdate = true;

        } else {
            group.scale.set(1, 1, 1);
            group.rotation.y += (handRotY - group.rotation.y) * 0.1;

            for (let i = 0; i < count; i++) {
                sizes[i] = baseSize;
                let brightness = 1.0;
                if (type === "gold" || type === "red") brightness = 0.8 + 0.5 * Math.sin(time * 12 + phases[i]);

                colors[i * 3] = baseColor.r * brightness;
                colors[i * 3 + 1] = baseColor.g * brightness;
                colors[i * 3 + 2] = baseColor.b * brightness;
            }
            group.geometry.attributes.size.needsUpdate = true;
            group.geometry.attributes.color.needsUpdate = true;
        }
    }

    function updateGalleryPoints(time) {
        if (!groupGallery) return;
        if (!galleryReady) return;

        const geo = groupGallery.geometry;
        const pos = geo.attributes.position.array;
        const size = geo.attributes.size.array;

        const scatter = geo.userData.scatterTargets;
        const finalT = geo.userData.finalTargets;
        const idxArr = geo.userData.imageIndex;

        // smooth
        const speed = 0.09;

        for (let i = 0; i < CONFIG.galleryCount; i++) {
            const imgIdx = idxArr[i]; // 0..4
            const revealed = imgIdx < galleryRevealCount;

            const tx = revealed ? finalT[i * 3 + 0] : scatter[i * 3 + 0];
            const ty = revealed ? finalT[i * 3 + 1] : scatter[i * 3 + 1];
            const tz = revealed ? finalT[i * 3 + 2] : scatter[i * 3 + 2];

            pos[i * 3 + 0] += (tx - pos[i * 3 + 0]) * speed;
            pos[i * 3 + 1] += (ty - pos[i * 3 + 1]) * speed;
            pos[i * 3 + 2] += (tz - pos[i * 3 + 2]) * speed;

            // size: invisible until that image is revealed
            const base = CONFIG.gallerySize;
            if (revealed) {
                // a tiny shimmer
                size[i] = base * (0.85 + 0.15 * Math.sin(time * 10 + i * 0.01));
            } else {
                size[i] = 0.0;
            }
        }

        geo.attributes.position.needsUpdate = true;
        geo.attributes.size.needsUpdate = true;
        if (geo.attributes.color) geo.attributes.color.needsUpdate = true;

        // slight overall rotation for depth

        groupGallery.rotation.y = 0;
    }

    function animate() {
        if (!renderer || !scene || !camera) return;

        requestAnimationFrame(animate);

        const time = Date.now() * 0.001;
        const speed = 0.08;
        const handRotY = (handX - 0.5) * 4.0;

        const isHeart = (state === "HEART");

        // ✅ 1) HEART: ẩn và không update 3 group cũ => không còn trái tim hạt
        groupGold.visible = !isHeart;
        groupRed.visible = !isHeart;
        groupGift.visible = !isHeart;

        if (!isHeart) {
            updateParticleGroup(groupGold, "gold", state, speed, handRotY, time);
            updateParticleGroup(groupRed, "red", state, speed, handRotY, time);
            updateParticleGroup(groupGift, "gift", state, speed, handRotY, time);
        }

        // ✅ 2) Chỉ hiện gallery khi HEART
        if (groupGallery) groupGallery.visible = isHeart;

        if (state === "TREE") {
            titleMesh.visible = true;
            starMesh.visible = true;
            loveMesh.visible = false;
            if (!msgShown) msgMesh.visible = false;

            titleMesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
            starMesh.rotation.z -= 0.02;
            starMesh.material.opacity = 0.7 + 0.3 * Math.sin(time * 5);

            photoMeshes.forEach((m) => { m.scale.lerp(new THREE.Vector3(0, 0, 0), 0.1); m.visible = false; });
            stopGallerySequence();

        } else if (state === "HEART") {
            titleMesh.visible = false;
            starMesh.visible = false;
                loveMesh.visible = false;
                photoMeshes.forEach((m) => { m.visible = false; });

            if (groupGallery) {
                groupGallery.visible = true;

                // build targets (async)
                if (!galleryReady && !galleryBuilding) {
                    buildGalleryTargets();
                }

                // ✅ CHỈ chạy reveal + morph khi READY
                if (galleryReady) {
                    startGallerySequence();
                    updateGalleryPoints(time);
                }
            }

        } else if (state === "EXPLODE") {
            titleMesh.visible = false;
            starMesh.visible = false;
            loveMesh.visible = false;
            if (!msgShown) msgMesh.visible = false;

            stopGallerySequence();

            const baseAngle = groupGold.rotation.y;
            const angleStep = (Math.PI * 2) / 5;
            let bestIdx = 0; let maxZ = -999;

            photoMeshes.forEach((mesh, i) => {
                mesh.visible = true;
                const angle = baseAngle + i * angleStep;
                const x = Math.sin(angle) * CONFIG.photoOrbitRadius;
                const z = Math.cos(angle) * CONFIG.photoOrbitRadius;
                const y = Math.sin(time + i) * 3;
                mesh.position.lerp(new THREE.Vector3(x, y, z), 0.1);
                mesh.lookAt(camera.position);

                if (z > maxZ) { maxZ = z; bestIdx = i; }

                if (z > 5) {
                    const ds = 1.0 + (z / CONFIG.photoOrbitRadius) * 0.8;
                    mesh.scale.lerp(new THREE.Vector3(ds, ds, ds), 0.1);
                } else {
                    mesh.scale.lerp(new THREE.Vector3(0.6, 0.6, 0.6), 0.1);
                }
            });
            selectedIndex = bestIdx;

        } else if (state === "PHOTO") {
            loveMesh.visible = false;
            if (!msgShown) msgMesh.visible = false;

            stopGallerySequence();

            photoMeshes.forEach((mesh, i) => {
                if (i === selectedIndex) {
                    mesh.position.lerp(new THREE.Vector3(0, 0, 60), 0.1);
                    mesh.scale.lerp(new THREE.Vector3(5, 5, 5), 0.1);
                    mesh.lookAt(camera.position);
                    mesh.rotation.z = 0;
                } else {
                    mesh.scale.lerp(new THREE.Vector3(0, 0, 0), 0.1);
                }
            });
        }

        renderer.render(scene, camera);
    }
    // =========================
    // 5) START + MEDIAPIPE HANDS
    // =========================
    function startSystem() {
        if (started) return;
        started = true;

        const btn = document.getElementById("btnStart");
        if (btn) btn.style.display = "none";

        // music
        bgMusic = new Audio(MUSIC_URL);
        bgMusic.loop = true;
        bgMusic.volume = 1.0;
        bgMusic.play().catch(() => { /* autoplay may be blocked */ });

        init3D();

        const video = document.getElementsByClassName("input_video")[0];
        const preview = document.getElementById("camera-preview");
        const ctx = preview?.getContext("2d");

        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        hands.onResults((results) => {
            if (ctx && results.image) {
                ctx.clearRect(0, 0, preview.width, preview.height);
                ctx.drawImage(results.image, 0, 0, preview.width, preview.height);
            }

            // Two-hands heart gesture => HEART state (gallery particles)
            if (results.multiHandLandmarks && results.multiHandLandmarks.length === 2) {
                const h1 = results.multiHandLandmarks[0];
                const h2 = results.multiHandLandmarks[1];
                const distIndex = Math.hypot(h1[8].x - h2[8].x, h1[8].y - h2[8].y);
                const distThumb = Math.hypot(h1[4].x - h2[4].x, h1[4].y - h2[4].y);
                if (distIndex < 0.15 && distThumb < 0.15) {
                    if (state !== "HEART") {
                        // reset reveal each time entering HEART: restart animation
                        stopGallerySequence();
                        galleryRevealCount = 0;
                        // always hide message and allow it to show again after sequence
                        msgMesh.visible = false;
                        msgShown = false;

                        // reset particle positions to scatter so the morph animates from scattered state
                        if (groupGallery && groupGallery.geometry) {
                            const geo = groupGallery.geometry;
                            const scatter = geo.userData.scatterTargets;
                            const pos = geo.attributes.position.array;
                            const sizes = geo.attributes.size.array;
                            // copy scatter into position buffer and reset sizes
                            for (let k = 0; k < pos.length; k++) pos[k] = scatter[k];
                            for (let k = 0; k < sizes.length; k++) sizes[k] = 0.0;
                            geo.attributes.position.needsUpdate = true;
                            geo.attributes.size.needsUpdate = true;
                        }
                    }
                    state = "HEART";
                    return;
                }
            }

            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const lm = results.multiHandLandmarks[0];
                handX = lm[9].x;

                const tips = [8, 12, 16, 20];
                const wrist = lm[0];
                let openDist = 0;
                tips.forEach((i) => openDist += Math.hypot(lm[i].x - wrist.x, lm[i].y - wrist.y));
                const avgDist = openDist / 4;

                const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);

                // fist => TREE, pinch => PHOTO, open => EXPLODE
                if (avgDist < 0.25) state = "TREE";
                else if (pinchDist < 0.05) state = "PHOTO";
                else state = "EXPLODE";
            } else {
                state = "TREE";
            }
        });

        const cam = new Camera(video, {
            onFrame: async () => { await hands.send({ image: video }); },
            width: 320,
            height: 240,
        });
        cam.start();
        window.addEventListener("resize", resizeToContainer);
    }

    // Bind button + upload UI
    window.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("btnStart");
        if (btn) btn.addEventListener("click", startSystem);

        const preview = document.getElementById("camera-preview");
        if (preview) {
            preview.width = 120;
            preview.height = 90;
        }

        // Upload UI bindings (allow user images to drive the particle gallery)
        const imgInput = document.getElementById("imgUpload");
        const useBtn = document.getElementById("useUploads");
        if (imgInput) {
            imgInput.addEventListener("change", (ev) => {
                uploadedImages = Array.from(ev.target.files || []);
                console.log("Uploaded files:", uploadedImages.map(f => f.name));
            });
        }

        if (useBtn) {
            useBtn.addEventListener("click", async () => {
                if (!uploadedImages || uploadedImages.length === 0) {
                    alert("Please select image files first (use the file chooser).");
                    return;
                }

                // read files as dataURLs
                const dataURLs = await Promise.all(uploadedImages.map((f) => new Promise((res, rej) => {
                    const r = new FileReader();
                    r.onload = () => res(r.result);
                    r.onerror = rej;
                    r.readAsDataURL(f);
                })));

                // replace heartFiles with uploaded images
                heartFiles = dataURLs;
                console.log("Using uploaded images for gallery:", heartFiles.length);

                // reset & rebuild gallery
                galleryReady = false;
                if (groupGallery && groupGallery.geometry) groupGallery.geometry.userData.ready = false;
                if (groupGallery) {
                    // make sure gallery visible if in HEART state
                    groupGallery.visible = (state === "HEART") || (galleryRevealCount >= getGalleryImageCount());
                    await buildGalleryTargets();
                }
            });
        }
    });

})();
