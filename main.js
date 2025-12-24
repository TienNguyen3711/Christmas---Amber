
/**
 * Shooting stars generator
 * - Tạo nhiều sao băng với vị trí/độ dài/tốc độ/delay ngẫu nhiên
 * - Responsive: resize sẽ regen để phù hợp màn hình
 */

const sky = document.getElementById('sky');

const CONFIG = {
  count: 22,               // số sao băng đồng thời
  angleDeg: 45,            // góc nghiêng bay
  minLen: 60,              // shorter tails for the look in the reference
  maxLen: 180,
  // thời gian bay (giây) — increased for slower, gentler motion
  minDur: 20.0,
  maxDur: 30.0,
  maxDelay: 15.0,

  // Start area: widen so stars appear across the top area of the page
  xRange: [0.02, 0.60],
  yRange: [0.02, 0.35],

  // End area: allow destinations across lower-right half (still in-frame)
  destXRange: [0.40, 0.98],
  destYRange: [0.40, 0.98]
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function clearStars(){
  sky.querySelectorAll('.shooting-star').forEach(el => el.remove());
}

function createStar(){
  const star = document.createElement('div');
  star.className = 'shooting-star';

  const w = window.innerWidth;
  const h = window.innerHeight;

  // start position near top-left
  const x = rand(CONFIG.xRange[0] * w, CONFIG.xRange[1] * w);
  const y = rand(CONFIG.yRange[0] * h, CONFIG.yRange[1] * h);

  const len = randInt(CONFIG.minLen, CONFIG.maxLen);
  const dur = rand(CONFIG.minDur, CONFIG.maxDur).toFixed(2);
  const delay = rand(0, CONFIG.maxDelay).toFixed(2);

  // compute a destination inside bottom-right so it ends in-frame
  const destX = rand(CONFIG.destXRange[0] * w, CONFIG.destXRange[1] * w);
  const destY = rand(CONFIG.destYRange[0] * h, CONFIG.destYRange[1] * h);
  const dx = destX - x;
  const dy = destY - y;
  const dist = Math.round(Math.hypot(dx, dy)) + 'px';
  // angle aligned to motion vector (degrees)
  const angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI);

  star.style.setProperty('--x', `${x}px`);
  star.style.setProperty('--y', `${y}px`);
  star.style.setProperty('--len', `${len}px`);
  star.style.setProperty('--dur', `${dur}s`);
  star.style.setProperty('--delay', `${delay}s`);

  // use a fixed diagonal direction (CONFIG.angleDeg) with tiny jitter
  const angleVar = CONFIG.angleDeg + rand(-2, 2);
  star.style.setProperty('--angle', `${angleVar}deg`);
  // thickness and tail opacity vary
  const thickness = randInt(1, 4) + 'px';
  const tailOpacity = (rand(0.45, 0.95)).toFixed(2);
  star.style.setProperty('--thickness', thickness);
  star.style.setProperty('--tail-opacity', tailOpacity);

  star.style.setProperty('--dist', dist);

  // add spark/head element (represents the bright cross-shaped head)
  const spark = document.createElement('span');
  spark.className = 'spark';
  star.appendChild(spark);

  return star;
}

function render(){
  clearStars();
  const frag = document.createDocumentFragment();
  const stars = [];
  for(let i = 0; i < CONFIG.count; i++){
    const star = createStar();
    frag.appendChild(star);
    stars.push(star);
  }
  // append first so elements exist before timeouts trigger
  sky.appendChild(frag);

  // schedule start using the per-star delay
  stars.forEach(star => {
    const delayMs = parseFloat(star.style.getPropertyValue('--delay')) * 1000 || 0;
    setTimeout(() => startStar(star), delayMs);
  });
}

// start animation for a star element and schedule its recreation when done
function startStar(star){
  if(!star.parentElement) sky.appendChild(star);
  star.classList.remove('animate');
  void star.offsetWidth;
  star.classList.add('animate');

  star.addEventListener('animationend', () => {
    star.remove();
    const nextDelay = rand(0, CONFIG.maxDelay) * 1000;
    setTimeout(() => {
      const newStar = createStar();
      sky.appendChild(newStar);
      startStar(newStar);
    }, nextDelay);
  }, { once: true });
}

// Regen khi resize để không bị lệch
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});

render();

/* ------------------------
   Reveal coordinator
   - After a short star show, reveal descriptive text word-by-word
   - Fade out right image and show words
   - On scroll into next section, fade the hero
   ------------------------ */

function revealDescriptiveText(text, wordDelay = 180){
  const container = document.getElementById('revealText');
  if(!container) return;
  container.innerHTML = '';
  container.classList.add('active');

  // also reveal the right-side hero image in sync
  const heroImg = document.getElementById('heroImage');
  if(heroImg){
    const right = document.getElementById('rightMedia');
    if(right) right.classList.remove('hidden');
    heroImg.classList.add('reveal');
  }

  // Support newline-separated lines. For each line, create word spans;
  // insert a <br> between lines so line breaks are respected.
  const lines = String(text).split(/\n/);
  let wordIndex = 0;
  lines.forEach((line, li) => {
    const words = line.split(/\s+/).filter(Boolean);
    words.forEach((w) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = w;
      container.appendChild(span);

      // schedule reveal for this word using cumulative index
      setTimeout(() => span.classList.add('visible'), wordIndex * wordDelay);
      wordIndex++;
    });
    // after each line (except last) insert a line break element
    if (li < lines.length - 1) {
      const br = document.createElement('br');
      container.appendChild(br);
      // small pause between lines: increment wordIndex slightly so next line starts later
      wordIndex += 1;
    }
  });
}

function replaceRightMedia(){
  const right = document.getElementById('rightMedia');
  if(!right) return;
  right.classList.add('hidden');
}

// trigger reveal after brief shooting-star show
window.addEventListener('load', ()=>{
  // short delay to let stars animate — adjust as needed
  setTimeout(()=>{
    // reveal bottom-left description (keep right image visible)
    // replaceRightMedia(); // intentionally disabled so hero image remains shown
    revealDescriptiveText(`Amber Lê - Hành trình một năm đáng nhớ.
  Merry Christmas. Chúc Bờ sẽ có một mùa Giáng Sinh an lành, vui vẻ và hạnh phúc bên người mình yêu thương.
  And I have a special gift for you 😁`, 200);
  }, 3200);
});

// scroll observer: when next section enters, fade hero
const next = document.getElementById('nextSection');
if(next){
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(en => {
      // fade only the left column (text) so the right image can be dimmed instead
      const leftCol = document.querySelector('.left');
      const right = document.getElementById('rightMedia');
      if(leftCol){
        if(en.isIntersecting) leftCol.classList.add('faded');
        else leftCol.classList.remove('faded');
      }
      if(right){
        if(en.isIntersecting) right.classList.add('dimmed');
        else right.classList.remove('dimmed');
      }
    });
  }, {threshold: 0.12});
  obs.observe(next);
}
