/**
 * Gradius Repro - Core Game Logic
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// キャンバスサイズ設定
canvas.width = 800;
canvas.height = 480;

// アセット管理
const assets = {
    ship_level: new Image(),
    ship_up: new Image(),
    ship_down: new Image(),
    enemy: new Image(),
    terrain: new Image(),
    capsule: new Image(),
    loaded: 0,
    total: 6
};

// 読み込み済み画像（透過済みCanvas）を保持するバッファ
const preRendered = {};

// 読み込みハンドラーの設定
const assetPaths = {
    ship_level: './assets/player_ship.png',
    ship_up: './assets/player_up.png',
    ship_down: './assets/player_down.png',
    enemy: './assets/enemy.png',
    terrain: './assets/terrain.png',
    capsule: './assets/capsule.png'
};

/**
 * 画像の背景を透明化したCanvasを作成する
 * 背景色(通常は黒)との色差分を計算し、境界を滑らかに除去する
 */
function createTransparentCanvas(img) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    tempCtx.drawImage(img, 0, 0);

    let imageData;
    try {
        imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    } catch (e) {
        console.warn("CORS restriction: Cannot access image data. Skipping transparency.", e);
        return img; // 透過処理をスキップして元画像を返す
    }
    const data = imageData.data;

    // 四隅のピクセルから背景色の平均値を推定（より正確なバックグラウンド除去）
    let br = 0, bg = 0, bb = 0;
    const corners = [0, (tempCanvas.width - 1) * 4, (tempCanvas.height - 1) * tempCanvas.width * 4, (data.length - 4)];
    corners.forEach(idx => {
        br += data[idx];
        bg += data[idx + 1];
        bb += data[idx + 2];
    });
    br /= 4; bg /= 4; bb /= 4;

    const threshold = 70; // 許容範囲を広げる

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 背景色との欧州距離（Euclidean distance）を計算
        const diff = Math.sqrt(Math.pow(r - br, 2) + Math.pow(g - bg, 2) + Math.pow(b - bb, 2));

        if (diff < threshold) {
            // 背景に近いピクセルは透明化。境界付近は少しアルファを残す
            if (diff < threshold * 0.5) {
                data[i + 3] = 0;
            } else {
                data[i + 3] = ((diff - threshold * 0.5) / (threshold * 0.5)) * 255;
            }
        }

        // 真っ暗なピクセルも強制的に落とす（ノイズ対策）
        if (r < 20 && g < 20 && b < 20) {
            data[i + 3] = 0;
        }
    }
    tempCtx.putImageData(imageData, 0, 0);
    return tempCanvas;
}

function checkAllLoaded() {
    console.log(`Loading progress: ${assets.loaded}/${assets.total}`);
    if (assets.loaded === assets.total) {
        console.log("All assets loaded success. Processing pre-render...");

        try {
            console.log("Starting pre-render...");
            preRendered.ship_level = createTransparentCanvas(assets.ship_level);
            preRendered.ship_up = createTransparentCanvas(assets.ship_up);
            preRendered.ship_down = createTransparentCanvas(assets.ship_down);
            preRendered.enemy = createTransparentCanvas(assets.enemy);
            preRendered.capsule = createTransparentCanvas(assets.capsule);
            preRendered.terrain = assets.terrain;
            console.log("Pre-render finished.");
        } catch (e) {
            console.error("Error during pre-render:", e);
            // エラーでもゲームは続行させる（画面に赤字を出さない）
            console.log("Proceeding without full transparency (CORS restriction likely)...");
        }
        console.log("Starting game loop.");
        resizeCanvas();
        requestAnimationFrame(loop);
    }
}

Object.keys(assetPaths).forEach(key => {
    const img = assets[key];
    img.onload = () => {
        console.log(`Resource loaded: ${key}`);
        assets.loaded++;
        checkAllLoaded();
    };
    img.onerror = () => {
        console.error(`Error loading ${key}`);
        assets.loaded++;
        checkAllLoaded();
    };
    img.src = assetPaths[key];
});

// レスポンシブ対応
function resizeCanvas() {
    const container = document.getElementById('game-container');
    if (!container) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = canvas.width / canvas.height;

    let newW, newH;
    if (w / h > ratio) {
        newH = h;
        newW = h * ratio;
    } else {
        newW = w;
        newH = w / ratio;
    }

    canvas.style.width = `${newW}px`;
    canvas.style.height = `${newH}px`;
}

window.addEventListener('resize', resizeCanvas);

// 音響エンジン（Web Audio APIを使用した動的生成）
class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // ショット音（矩形波）
    playShoot() {
        this._tone(440, 880, 0.05, 'square', 0.02); // 長さを半分、音量を大幅に下げ
    }

    // 爆発音（ノイズ）
    playExplosion() {
        const duration = 0.3;
        const node = this.ctx.createBufferSource();
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        node.buffer = buffer;

        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(1000, this.ctx.currentTime);
        lowpass.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime); // 0.3 -> 0.1
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);

        node.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(this.ctx.destination);
        node.start();
    }

    // パワーアップ音
    playPowerUp() {
        this._tone(880, 1760, 0.2, 'sine');
    }

    // カプセル取得音
    playCapsule() {
        this._tone(660, 1320, 0.1, 'triangle');
    }

    // シーケンサー風BGM（多重演奏）
    playBGM() {
        if (this.bgmTimer) return;
        let step = 0;

        // 音階周波数 (4オクターブ)
        const N = {
            C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
            C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
            C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
            C6: 1046.50
        };

        // グラディウス "空中戦 (Beginning of the History)" 風ベース
        const melody = [
            N.A4, N.C5, N.E5, 0, N.D5, N.C5, N.B4, 0, N.A4, N.C5, N.E5, 0, N.G5, N.F5, N.E5, 0,
            N.A4, N.C5, N.E5, 0, N.D5, N.C5, N.B4, 0, N.G4, N.A4, N.B4, 0, N.E4, 0, 0, 0
        ];

        const bass = [
            N.A3, N.A3, N.G3, N.G3, N.F3, N.F3, N.G3, N.G3, N.A3, N.A3, N.G3, N.G3, N.F3, N.F3, N.G3, N.G3,
            N.A3, N.A3, N.G3, N.G3, N.F3, N.F3, N.G3, N.G3, N.E3, N.E3, N.E3, N.E3, N.E3, N.E3, N.E3, N.E3
        ];

        this.bgmTimer = setInterval(() => {
            const time = this.ctx.currentTime;
            const beat = step % melody.length;

            if (melody[beat] > 0) {
                this._createGrain(melody[beat], time, 0.1, 'square', 0.06);
            }

            if (bass[beat] > 0) {
                this._createGrain(bass[beat], time, 0.08, 'triangle', 0.12);
            }

            // ドラム
            if (step % 2 === 0) {
                if (step % 4 === 0) {
                    this.playExplosion(0.04, 0.04); // Kick
                } else {
                    this._tone(3000, 5000, 0.01, 'sawtooth', 0.015); // HH
                }
            }

            step++;
        }, 100); // テンポアップ (BPM 150)
    }

    playExplosion(vol = 0.3, duration = 0.3) {
        const node = this.ctx.createBufferSource();
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        node.buffer = buffer;

        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(1000, this.ctx.currentTime);
        lowpass.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);

        node.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(this.ctx.destination);
        node.start();
    }

    _createGrain(freq, time, duration, type, vol) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(vol, time);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
    }

    _tone(f1, f2, duration, type, vol = 0.1) {
        this._createGrain(f1, this.ctx.currentTime, duration, type, vol);
    }
}

const audio = new AudioEngine();

// ゲーム状態
const state = {
    running: true,
    lastTime: 0,
    keys: {},
    audioStarted: false
};

// ショット（およびレーザー）クラス
class Bullet {
    constructor(x, y, type = 'normal') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = (type === 'laser') ? 60 : 15;
        this.height = (type === 'laser') ? 4 : 3;
        this.speed = (type === 'laser') ? 12 : 8;
        this.active = true;
        this.piercing = (type === 'laser');
    }

    update() {
        this.x += this.speed;
        if (this.x > canvas.width) this.active = false;
    }

    draw() {
        if (this.type === 'laser') {
            ctx.fillStyle = '#0ff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#0ff';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = '#ff0';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

// 斜めショット（Double用）
class DoubleBullet extends Bullet {
    constructor(x, y) {
        super(x, y, 'double');
        this.speedX = 7;
        this.speedY = -4; // 上向き
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width || this.y < 0) this.active = false;
    }
}

// ミサイルクラス
class Missile {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 15;
        this.height = 8;
        this.speedX = 3;
        this.speedY = 3;
        this.active = true;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width || this.y > canvas.height) this.active = false;
    }

    draw() {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + 15, this.y + 4);
        ctx.lineTo(this.x, this.y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#f00';
        ctx.stroke();
    }
}

// 地形クラス
class Terrain {
    constructor() {
        this.points = [];
        this.step = 20;
        this.speed = 2;
        this.width = canvas.width + this.step;
        // 初期地形生成
        for (let x = 0; x <= this.width; x += this.step) {
            this.points.push(this._generatePoint());
        }
    }

    _generatePoint() {
        // 上下の高さをランダムに生成（ある程度滑らかに）
        const baseTop = 40;
        const baseBottom = 40;
        const lastPoint = this.points[this.points.length - 1] || { top: baseTop, bottom: baseBottom };
        return {
            top: Math.max(20, Math.min(120, lastPoint.top + (Math.random() - 0.5) * 20)),
            bottom: Math.max(20, Math.min(120, lastPoint.bottom + (Math.random() - 0.5) * 20))
        };
    }

    update() {
        // 先頭のポイントを左にずらす
        this.points.forEach((p, i) => {
            // ここでは描画時にずらすため、管理はオフセットで行うのが効率的
        });
        // 簡易的に：一定距離進んだら新しいポイントを追加して古いものを捨てる
    }

    draw(scrollOffset) {
        const offset = scrollOffset % this.step;
        const startIndex = Math.floor(scrollOffset / this.step);

        // テクスチャパターン作成
        const pattern = ctx.createPattern(preRendered.terrain, 'repeat');
        ctx.fillStyle = pattern;

        // 天井
        ctx.save();
        ctx.translate(-offset, 0);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let i = 0; i < canvas.width / this.step + 5; i++) {
            const p = this.points[startIndex + i] || { top: 40 };
            ctx.lineTo(i * this.step, p.top);
        }
        ctx.lineTo(canvas.width + offset, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#884';
        ctx.stroke();
        ctx.restore();

        // 地面
        ctx.save();
        ctx.translate(-offset, 0);
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);
        for (let i = 0; i < canvas.width / this.step + 5; i++) {
            const p = this.points[startIndex + i] || { bottom: 40 };
            ctx.lineTo(i * this.step, canvas.height - p.bottom);
        }
        ctx.lineTo(canvas.width + offset, canvas.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 追加ポイント生成
        if (startIndex + canvas.width / this.step + 10 > this.points.length) {
            this.points.push(this._generatePoint());
        }
    }

    checkCollision(x, y, w, h, scrollOffset) {
        const startIndex = Math.floor(scrollOffset / this.step);
        const offset = scrollOffset % this.step;

        // 自機の左右範囲にある地形インデックスを特定
        const i1 = Math.floor((x + offset) / this.step);
        const i2 = Math.floor((x + w + offset) / this.step);

        for (let i = i1; i <= i2; i++) {
            const p = this.points[i];
            if (!p) continue;
            // 天井との衝突
            if (y < p.top) return true;
            // 地面との衝突
            if (y + h > canvas.height - p.bottom) return true;
        }
        return false;
    }
}

const terrain = new Terrain();
let scroll = 0;

// パワーアップカプセルクラス
class Capsule {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30; // 描画サイズに合わせる
        this.height = 30;
        this.speed = 1.5;
        this.active = true;
    }

    update() {
        this.x -= this.speed;
        if (this.x < -this.width) this.active = false;
    }

    draw() {
        // カプセル描画 (hitboxと位置を合わせるため左上基準)
        ctx.drawImage(preRendered.capsule, this.x, this.y, this.width, this.height);
    }
}

// 爆発パーティクルクラス
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 4;
        this.speedY = (Math.random() - 0.5) * 4;
        this.color = color;
        this.alpha = 1;
        this.decay = Math.random() * 0.02 + 0.01;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.alpha -= this.decay;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

class Explosion {
    constructor(x, y, color = '#f0f') {
        this.particles = Array.from({ length: 15 }, () => new Particle(x, y, color));
        this.active = true;
    }

    update() {
        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => p.alpha > 0);
        if (this.particles.length === 0) this.active = false;
    }

    draw() {
        this.particles.forEach(p => p.draw());
    }
}

// 敵クラス (赤敵の概念追加)
class Enemy {
    constructor(x, y, pattern, isRed = false) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.speed = 2;
        this.active = true;
        this.pattern = pattern;
        this.isRed = isRed;
        this.time = 0;
    }

    update() {
        this.time += 0.05;
        this.x -= this.speed;

        if (this.pattern === 'wave') {
            this.y += Math.sin(this.time) * 3;
        }

        if (this.x < -this.width) this.active = false;
    }

    draw() {
        // 敵描画 (hitboxと位置を合わせるため左上基準)
        ctx.drawImage(preRendered.enemy, this.x, this.y, this.width, this.height);
        if (this.isRed) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }
    }
}

// オプション（分身）クラス
class Option {
    constructor(player, delay) {
        this.player = player;
        this.delay = delay; // 履歴の何フレーム前を追いかけるか
        this.x = player.x;
        this.y = player.y;
        this.width = 20;
        this.height = 10;
    }

    update() {
        // 自機の履歴から過去の座標を取得
        if (this.player.history.length > this.delay) {
            const pos = this.player.history[this.player.history.length - 1 - this.delay];
            this.x = pos.x;
            this.y = pos.y;
        }
    }

    draw() {
        ctx.fillStyle = '#f80'; // オレンジ色
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.width, this.y + this.height / 2);
        ctx.lineTo(this.x, this.y + this.height);
        ctx.closePath();
        ctx.fill();
        // 光の演出
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f80';
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    shoot() {
        // 自機と同じ武装で撃つ
        if (this.player.weapons.laser) {
            bullets.push(new Bullet(this.x + this.width, this.y + this.height / 2 - 2, 'laser'));
        } else {
            bullets.push(new Bullet(this.x + this.width, this.y + this.height / 2 - 1.5, 'normal'));
            if (this.player.weapons.double) {
                bullets.push(new DoubleBullet(this.x + this.width, this.y));
            }
        }
    }
}

// 自機クラス (ゲージ管理追加)
class Player {
    constructor() {
        this.width = 40;
        this.height = 20;
        this.x = 50;
        this.y = canvas.height / 2;
        this.speed = 3;
        this.color = '#fff';
        this.shootTimer = 0;
        this.powerUpIndex = -1; // -1: なし, 0: SPEED, 1: MISSILE, ...
        this.gaugeItems = ['speed-up', 'missile', 'double', 'laser', 'option', 'shield'];
        this.weapons = {
            missile: false,
            double: false,
            laser: false,
            optionCount: 0,
            shield: 0 // 0: なし, >0: 耐久度
        };
        this.history = []; // 座標履歴
        this.options = [];
        this.alive = true;
        this.state = 'level'; // 'level', 'up', 'down'
    }

    update() {
        const oldX = this.x;
        const oldY = this.y;

        this.state = 'level';
        if (state.keys['ArrowUp'] || state.keys['w']) {
            this.y -= this.speed;
            this.state = 'up';
        } else if (state.keys['ArrowDown'] || state.keys['s']) {
            this.y += this.speed;
            this.state = 'down';
        }

        if (state.keys['ArrowLeft'] || state.keys['a']) this.x -= this.speed;
        if (state.keys['ArrowRight'] || state.keys['d']) this.x += this.speed;

        // 画面外抑制
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
        this.y = Math.max(0, Math.min(canvas.height - this.height, this.y));

        // 座標が変わった場合のみ履歴に保存（グラディウス式）
        if (oldX !== this.x || oldY !== this.y) {
            this.history.push({ x: this.x, y: this.y });
            if (this.history.length > 100) this.history.shift();
        }

        // オプション更新
        this.options.forEach(opt => opt.update());

        // ショット発射 (Spaceキー)
        if (state.keys[' '] && this.shootTimer <= 0) {
            this.shoot();
            this.shootTimer = 10;
        }
        if (this.shootTimer > 0) this.shootTimer--;

        // パワーアップ発動 (Shiftキー)
        if (state.keys['Shift'] && this.powerUpIndex >= 0) {
            this.activatePowerUp();
            audio.playPowerUp();
            state.keys['Shift'] = false; // 1回押し切り
        }
    }

    draw() {
        if (!this.alive) return;

        // 状態に応じた画像を選択
        let img = preRendered.ship_level;
        if (this.state === 'up') img = preRendered.ship_up;
        if (this.state === 'down') img = preRendered.ship_down;

        // グラディウス風のサイズ。画像が正方形に近い場合があるので、
        // 描画時に少し横長に調整するか、あるいは比率を保つ。
        const drawW = 56;
        const drawH = 32;

        ctx.drawImage(img, this.x, this.y, drawW, drawH);

        // シールド描画
        if (this.weapons.shield > 0) {
            ctx.strokeStyle = '#4af';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#4af';
            ctx.beginPath();
            ctx.arc(this.x + this.width, this.y + this.height / 2, 25, -Math.PI / 2, Math.PI / 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    shoot() {
        // メインショット
        if (this.weapons.laser) {
            bullets.push(new Bullet(this.x + this.width, this.y + this.height / 2 - 2, 'laser'));
        } else {
            bullets.push(new Bullet(this.x + this.width, this.y + this.height / 2 - 1.5, 'normal'));
            if (this.weapons.double) {
                bullets.push(new DoubleBullet(this.x + this.width, this.y));
            }
        }

        // ミサイル
        if (this.weapons.missile && missiles.length < 2) {
            missiles.push(new Missile(this.x + this.width, this.y + this.height));
        }

        // オプションの射撃
        this.options.forEach(opt => opt.shoot());

        audio.playShoot();
    }

    collectCapsule() {
        this.powerUpIndex = (this.powerUpIndex + 1) % this.gaugeItems.length;
        this.updateGaugeUI();
        audio.playCapsule();
    }

    updateGaugeUI() {
        this.gaugeItems.forEach((id, idx) => {
            const el = document.getElementById(id);
            if (idx === this.powerUpIndex) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    activatePowerUp() {
        const item = this.gaugeItems[this.powerUpIndex];
        console.log("Powering up:", item);
        switch (item) {
            case 'speed-up':
                if (this.speed < 8) this.speed += 1;
                break;
            case 'missile':
                this.weapons.missile = true;
                break;
            case 'double':
                this.weapons.double = true;
                this.weapons.laser = false;
                break;
            case 'laser':
                this.weapons.laser = true;
                this.weapons.double = false;
                break;
            case 'option':
                if (this.options.length < 4) {
                    const delay = (this.options.length + 1) * 15;
                    this.options.push(new Option(this, delay));
                }
                break;
            case 'shield':
                this.weapons.shield = 5; // 耐久度5
                break;
        }
        this.powerUpIndex = -1;
        this.updateGaugeUI();
    }

    // draw() は既に上で定義されているため削除
}

const player = new Player();
let bullets = [];
let missiles = [];
let enemies = [];
let capsules = [];
let explosions = [];
let spawnTimer = 0;

// キー入力イベント
window.addEventListener('keydown', (e) => {
    state.keys[e.key] = true;
    // 初回入力でオーディオ再開
    if (!state.audioStarted) {
        audio.ctx.resume();
        state.audioStarted = true;
    }
    // ゲームオーバー中にEnterでリスタート
    if (!player.alive && e.key === 'Enter') {
        resetGame();
    }
});
window.addEventListener('keyup', (e) => state.keys[e.key] = false);

// メインループ
let initialized = false;
function loop(timestamp) {
    try {
        if (!initialized) {
            console.log("Loop is running.");
            initialized = true;
        }
        if (!state.running) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 初回入力でオーディオ開始
        if (state.audioStarted) audio.playBGM();

        drawStars();

        // 地形描画
        terrain.draw(scroll);
        scroll += 2;

        player.update();

        // 地形当たり判定
        if (player.alive && terrain.checkCollision(player.x, player.y, player.width, player.height, scroll)) {
            player.alive = false; // 地形接触は即死
            explosions.push(new Explosion(player.x + player.width / 2, player.y + player.height / 2, '#fff'));
            audio.playExplosion();
            // BGM停止
            if (audio.bgmTimer) {
                clearInterval(audio.bgmTimer);
                audio.bgmTimer = null;
            }
        }

        // ショット更新
        bullets = bullets.filter(b => b.active);
        bullets.forEach(b => b.update());

        // ミサイル更新
        missiles = missiles.filter(m => m.active);
        missiles.forEach(m => m.update());

        // カプセル更新
        capsules = capsules.filter(c => c.active);
        capsules.forEach(c => c.update());

        // 爆発更新
        explosions = explosions.filter(ex => ex.active);
        explosions.forEach(ex => ex.update());

        // 敵スポーン
        if (spawnTimer <= 0) {
            const isRed = Math.random() < 0.3; // 30%の確率で赤い敵
            enemies.push(new Enemy(canvas.width, Math.random() * (canvas.height - 40), 'wave', isRed));
            spawnTimer = 60;
        }
        spawnTimer--;

        // 敵更新
        enemies = enemies.filter(e => e.active);
        enemies.forEach(e => e.update());

        // 当たり判定 (弾 vs 敵)
        bullets.forEach(b => {
            enemies.forEach(e => {
                if (b.x < e.x + e.width && b.x + b.width > e.x &&
                    b.y < e.y + e.height && b.y + b.height > e.y) {
                    if (!b.piercing) b.active = false;
                    e.active = false;
                    explosions.push(new Explosion(e.x + e.width / 2, e.y + e.height / 2, e.isRed ? '#f44' : '#f0f'));
                    audio.playExplosion();
                    if (e.isRed) capsules.push(new Capsule(e.x, e.y));
                }
            });
        });

        // 当たり判定 (ミサイル vs 敵)
        missiles.forEach(m => {
            enemies.forEach(e => {
                if (m.x < e.x + e.width && m.x + m.width > e.x &&
                    m.y < e.y + e.height && m.y + m.height > e.y) {
                    m.active = false;
                    e.active = false;
                    explosions.push(new Explosion(e.x + e.width / 2, e.y + e.height / 2, e.isRed ? '#f44' : '#f0f'));
                    audio.playExplosion();
                    if (e.isRed) capsules.push(new Capsule(e.x, e.y));
                }
            });
        });

        // 当たり判定 (自機 vs カプセル)
        capsules.forEach(c => {
            if (player.x < c.x + c.width && player.x + player.width > c.x &&
                player.y < c.y + c.height && player.y + player.height > c.y) {
                c.active = false;
                player.collectCapsule();
            }
        });

        // 当たり判定 (自機 vs 敵)
        if (player.alive) {
            enemies.forEach(e => {
                if (player.x < e.x + e.width && player.x + player.width > e.x &&
                    player.y < e.y + e.height && player.y + player.height > e.y) {
                    if (player.weapons.shield > 0) {
                        player.weapons.shield--;
                        e.active = false;
                        explosions.push(new Explosion(e.x + e.width / 2, e.y + e.height / 2, '#4af'));
                        audio.playExplosion(0.2, 0.1);
                    } else {
                        player.alive = false;
                        explosions.push(new Explosion(player.x + player.width / 2, player.y + player.height / 2, '#fff'));
                        audio.playExplosion();
                        if (audio.bgmTimer) {
                            clearInterval(audio.bgmTimer);
                            audio.bgmTimer = null;
                        }
                    }
                }
            });
        }

        // 描画
        player.draw();
        player.options.forEach(opt => opt.draw());
        bullets.forEach(b => b.draw());
        missiles.forEach(m => m.draw());
        enemies.forEach(e => e.draw());
        capsules.forEach(c => c.draw());
        explosions.forEach(ex => ex.draw());

        // ゲームオーバー表示
        if (!player.alive) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '48px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
            ctx.font = '24px monospace';
            ctx.fillText('PRESS ENTER TO RESTART', canvas.width / 2, canvas.height / 2 + 50);
        }

        requestAnimationFrame(loop);
    } catch (e) {
        console.error("Game Loop Error:", e);
        state.running = false;
        ctx.fillStyle = 'red';
        ctx.font = '20px monospace';
        ctx.fillText('Runtime Error: ' + e.message, 50, 100);
    }
}

function resetGame() {
    player.alive = true;
    player.x = 50;
    player.y = canvas.height / 2;
    player.speed = 3;
    player.weapons = { missile: false, double: false, laser: false, optionCount: 0, shield: 0 };
    player.options = [];
    player.powerUpIndex = -1;
    player.updateGaugeUI();
    bullets = [];
    missiles = [];
    enemies = [];
    capsules = [];
    explosions = [];
    scroll = 0;
    // BGM再開は次のキー入力待ち
}

// 簡易背景（星）
const stars = Array.from({ length: 50 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    speed: 1 + Math.random() * 3
}));

function drawStars() {
    ctx.fillStyle = '#fff';
    stars.forEach(star => {
        star.x -= star.speed;
        if (star.x < 0) star.x = canvas.width;
        ctx.fillRect(star.x, star.y, 2, 2);
    });
}

// 削除：ファイル末尾の自動開始
// requestAnimationFrame(loop);
