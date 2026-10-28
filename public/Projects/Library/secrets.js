import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export const SHREK_SECRETS = [
    {
        id: 'onion-doctrine',
        title: 'The Sacred Onion Doctrine',
        subtitle: 'An Apocryphal Monograph on Ogres & Alliums',
        badge: 'Swamp Apocrypha · Layer I',
        body: `
            <p><strong>"Ogres are not like cakes.</strong> Everybody loves cakes! Cakes have layers. Nor are they like parfaits. Have you ever met a person, you say, <em>'Let's get some parfait,'</em> and they say, <em>'Hell no, I don't like no parfait'</em>? Parfaits are delicious!</p>
            <p>No. <strong>Ogres are like onions.</strong></p>
            <ul>
                <li><em>They stink?</em> Yes. No!</li>
                <li><em>They make you cry?</em> Yes. No!</li>
                <li><em>You leave 'em out in the sun, they get all brown, start sproutin' little white hairs?</em> NO!</li>
            </ul>
            <p><strong>LAYERS.</strong> Onions have layers. Ogres have layers. We both have layers. End of story. Bye-bye. See ya later.</p>
        `,
    },
    {
        id: 'royal-eviction',
        title: 'Royal Eviction Decree 404',
        subtitle: 'By Order of His Eminence, Lord Farquaad',
        badge: 'Duloc Royal Edict · Seal of Farquaad',
        body: `
            <p><strong>Notice of Compulsory Relocation:</strong> All anomalous fairytale denizens, enchanted wooden juveniles with nasal expansion syndromes, talking equines, and blind rodent trios are hereby declared an aesthetic blight upon the perfection of Duloc.</p>
            <p>You are hereby banished and remanded forthwith into the private squalor of <em>The Swamp</em>.</p>
            <p><em>Addendum:</em> Any gingerbread confectioners withholding information regarding the whereabouts of the Muffin Man will face severe beverage dunking and gumdrop button amputation.</p>
        `,
    },
    {
        id: 'waffle-manifesto',
        title: 'The Morning Waffle Manifesto',
        subtitle: 'Transcribed from the Midnight Musings of a Noble Steed',
        badge: 'Waffle Codex · Vol. VII',
        body: `
            <p><strong>"Can I stay with you? Please?"</strong></p>
            <p>Listen, we can stay up late, swapping manly stories, and in the morning... <strong>I'm making waffles!</strong></p>
            <p>Where am I gonna sleep? Outside? In the dirt? With the crickets? Man, you gotta let me in! You don't know what it's like to be considered a freak... well, maybe you do. But that's why we gotta stick together! You gotta let me stay!</p>
            <p><em>(And yes, I can fly. You might have seen a housefly, maybe even a superfly, but you ain't never seen a donkey fly!)</em></p>
        `,
    },
    {
        id: 'dragons-keep',
        title: "The Dragon's Keep Survival Companion",
        subtitle: 'Field Notes from the Perilous Sulphur Chasm',
        badge: 'Knighthood Manual · Chapter IV',
        body: `
            <p><strong>Section 1: The Perimeter Bridge.</strong><br>
            The rotted timber bridge suspended over the boiling sea of brimstone will swing violently. Do not look down. If your steed freezes, do not push him; offer him emotional validation.</p>
            <p><strong>Section 2: The Beast.</strong><br>
            If cornered by a colossal, razor-fanged crimson dragon, do <em>NOT</em> unsheathe your sword. Instead, note the luminous eyeshadow, compliment the dazzling dental hygiene, and proclaim: <em>"My, what large teeth you have... I mean, white sparkling teeth! You must bleach!"</em></p>
            <p>Dragons are hopeless romantics. Proceed with charm.</p>
        `,
    },
    {
        id: 'duloc-anthem',
        title: 'The Duloc Citizen Harmony Code',
        subtitle: 'As Sung by the Clockwork Gate Marionettes',
        badge: 'Duloc Protocol · Rule 1-A',
        body: `
            <p><em>"Welcome to Duloc, such a perfect town!<br>
            Here we have some rules, let us lay them down:<br>
            Please keep off of the grass, shine your shoes, wipe your... face.<br>
            Duloc is, Duloc is, Duloc is a perfect place!"</em></p>
            <p><strong>Mandatory Municipal Statutes:</strong></p>
            <ul>
                <li>Spitting into the moat is punishable by the pillory.</li>
                <li>Lord Farquaad's height shall never be measured against standard castle masonry.</li>
                <li>Applause signs are strictly mandatory. When the cue flashes, you WILL applaud.</li>
            </ul>
        `,
    },
];

/**
 * Creates the Celestial Tome / Falling Star in the library well.
 */
export function createCelestialTome(scene, U) {
    const group = new THREE.Group();
    scene.add(group);

    // Book geometry: spine + covers
    const bookGeo = new THREE.BoxGeometry(0.18, 0.72, 0.52);
    const bookMat = new THREE.MeshBasicMaterial({
        color: 0x98ff98,
        transparent: true,
        opacity: 0,
    });
    const bookMesh = new THREE.Mesh(bookGeo, bookMat);
    group.add(bookMesh);

    // Sparkle trail points
    const TRAIL_COUNT = 40;
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(TRAIL_COUNT * 3);
    const trailAlpha = new Float32Array(TRAIL_COUNT);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlpha, 1));

    const trailMat = new THREE.ShaderMaterial({
        uniforms: { uTime: U.uTime },
        vertexShader: `
            attribute float aAlpha;
            varying float vAlpha;
            void main() {
                vAlpha = aAlpha;
                vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
                gl_PointSize = clamp(16.0 / -mv.z, 2.0, 10.0);
                gl_Position = projectionMatrix * mv;
            }
        `,
        fragmentShader: `
            varying float vAlpha;
            void main() {
                float dist = length(gl_PointCoord - 0.5);
                if (dist > 0.5) discard;
                float glow = 1.0 - smoothstep(0.08, 0.5, dist);
                gl_FragColor = vec4(0.85, 1.0, 0.65, glow * vAlpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const trailMesh = new THREE.Points(trailGeo, trailMat);
    trailMesh.frustumCulled = false;
    scene.add(trailMesh);

    const history = [];
    let state = {
        active: false,
        startY: 0,
        y: 0,
        targetY: 0,
        speed: 2.2,
        angle: 0,
        radius: 1.8,
        timeUntilSpawn: 3.5, // Spawns shortly after entry
        secretIndex: 0,
    };

    function spawn(camY, spanAbove = 65, spanBelow = 30) {
        state.active = true;
        // Start deep in the fog above the camera
        state.startY = camY + spanAbove + 6.0;
        state.y = state.startY;
        // Fall deep into the abyss fog below the camera before fading out
        state.targetY = camY - spanBelow - 12.0;
        state.angle = Math.random() * Math.PI * 2;
        state.radius = 1.2 + Math.random() * 1.6;
        state.speed = 2.4 + Math.random() * 0.8;
        state.secretIndex = Math.floor(Math.random() * SHREK_SECRETS.length);
        history.length = 0;
        group.visible = true;
        trailMesh.visible = true;
        bookMat.opacity = 0;
    }

    function checkHit(raycaster) {
        if (!state.active || !group.visible || bookMat.opacity < 0.2) return false;
        const hits = raycaster.intersectObject(bookMesh);
        return hits.length > 0;
    }

    return {
        update(dt, time, camY, spanAbove = 65, spanBelow = 30) {
            if (!state.active) {
                if (U.uAstralPos) U.uAstralPos.value.set(0, -9999, 0, 0);
                state.timeUntilSpawn -= dt;
                if (state.timeUntilSpawn <= 0) {
                    spawn(camY, spanAbove, spanBelow);
                }
                return;
            }

            state.y -= state.speed * dt;
            state.angle += dt * 0.95;
            const x = Math.cos(state.angle) * state.radius;
            const z = Math.sin(state.angle) * state.radius;

            group.position.set(x, state.y, z);
            group.rotation.set(time * 0.8, state.angle + Math.PI / 2, Math.sin(time * 1.5) * 0.3);

            // Shimmering color cycle
            const hue = 0.28 + Math.sin(time * 2.5) * 0.08;
            bookMat.color.setHSL(hue, 0.95, 0.65);

            // Smooth fade-in from upper fog and fade-out into deep abyss fog
            const fadeIn = Math.min(1.0, Math.max(0.0, (state.startY - state.y) / 8.0));
            const fadeOut = Math.min(1.0, Math.max(0.0, (state.y - state.targetY) / 10.0));
            const masterAlpha = Math.min(fadeIn, fadeOut);
            bookMat.opacity = masterAlpha;

            // Broadcast position to shared uniforms so pages are pushed aside
            if (U.uAstralPos) {
                U.uAstralPos.value.set(x, state.y, z, masterAlpha > 0.1 ? 1.0 : 0.0);
            }

            // Update trail
            history.unshift(new THREE.Vector3(x, state.y, z));
            if (history.length > TRAIL_COUNT) history.pop();

            const posAttr = trailGeo.attributes.position;
            const alphaAttr = trailGeo.attributes.aAlpha;
            for (let i = 0; i < TRAIL_COUNT; i++) {
                if (i < history.length) {
                    posAttr.setXYZ(i, history[i].x, history[i].y + i * 0.06, history[i].z);
                    alphaAttr.setX(i, (1 - i / TRAIL_COUNT) * 0.85 * masterAlpha);
                } else {
                    alphaAttr.setX(i, 0);
                }
            }
            posAttr.needsUpdate = true;
            alphaAttr.needsUpdate = true;

            // Despawn once deep in the abyss fog
            if (state.y <= state.targetY) {
                state.active = false;
                group.visible = false;
                trailMesh.visible = false;
                if (U.uAstralPos) U.uAstralPos.value.set(0, -9999, 0, 0);
                state.timeUntilSpawn = 22 + Math.random() * 14;
            }
        },

        checkHit,

        getSecret() {
            return SHREK_SECRETS[state.secretIndex];
        },

        dismiss() {
            state.active = false;
            group.visible = false;
            trailMesh.visible = false;
            if (U.uAstralPos) U.uAstralPos.value.set(0, -9999, 0, 0);
            state.timeUntilSpawn = 20 + Math.random() * 10;
        },

        dispose() {
            scene.remove(group);
            scene.remove(trailMesh);
            bookGeo.dispose();
            bookMat.dispose();
            trailGeo.dispose();
            trailMat.dispose();
        },
    };
}
