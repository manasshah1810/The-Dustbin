import { useCallback, useEffect, useRef, useState, lazy, Suspense, Component } from 'react';
import { morph } from './particles.js';

const loadRoom = () => import('./Room.jsx');
const Room = lazy(loadRoom);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const ROOM_MS = 12600;

class Boundary extends Component {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch() { this.props.onFail && this.props.onFail(); }
  render() { return this.state.bad ? null : this.props.children; }
}
const Chars = ({ text, base }) => (
  <span className="lbl" aria-hidden="true">{[...text].map((c, i) => <span key={i} className="ch" style={{ '--i': base + i }}>{c === ' ' ? ' ' : c}</span>)}</span>
);

export default function Intro({ onDone }) {
  const [stage, setStage] = useState('gate');      // gate → morph → (room) → out
  const [roomOn, setRoomOn] = useState(false), [warm, setWarm] = useState(false);
  const [skipOn, setSkipOn] = useState(false);
  const [dark, setDark] = useState(false);
  const canvas = useRef(), labels = useRef([]), timers = useRef([]), done = useRef(false), ready = useRef(false);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };

  const finish = useCallback(() => {
    if (done.current) return; done.current = true;
    timers.current.forEach(clearTimeout); setDark(true); setSkipOn(false);
    setTimeout(onDone, reduce ? 120 : 850);
  }, [onDone]);

  useEffect(() => { let t; loadRoom().then(() => { t = setTimeout(() => setWarm(true), 900); }).catch(() => {}); return () => clearTimeout(t); }, []);   // build the room, hidden, while they read the gate                       // warm the 3D chunk while they decide
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && stage !== 'gate') finish(); };
    const s = () => finish();
    addEventListener('keydown', k); addEventListener('dustbin:skip', s);
    return () => { removeEventListener('keydown', k); removeEventListener('dustbin:skip', s); };
  }, [stage, finish]);

  const choose = (sound) => {
    if (stage !== 'gate') return;
    setStage('morph');
    dispatchEvent(new CustomEvent('dustbin:begin', { detail: { sound } }));
    const showSpeaker = () => { document.body.classList.add('speaker-on'); setSkipOn(true); setRoomOn(true); later(() => { const c = canvas.current; c && c.getContext('2d').clearRect(0, 0, c.width, c.height); }, 1000); };   // particles hold the icon while the real one fades in
    if (reduce) { showSpeaker(); setRoomOn(true); later(finish, 3200); return; }
    const L = labels.current.map((el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { text: el.dataset.text, x: r.left, baseline: r.top + parseFloat(cs.fontSize) * 0.98 + (r.height - parseFloat(cs.fontSize) * 1.15) / 2, font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` };
    });
    morph({ canvas: canvas.current, labels: L, muted: !sound, onDone: showSpeaker });
    later(finish, 3500 + 9000 + ROOM_MS);                                      // fallback if the room never starts
  };
  const roomReady = useCallback(() => {
    if (ready.current) return; ready.current = true;
    timers.current.forEach(clearTimeout); timers.current = [];
    later(finish, ROOM_MS);
  }, [finish]);

  return (
    <div className={`intro ${stage} ${dark ? 'dark' : ''}`} role="dialog" aria-label="Start the story">
      <div className={`room ${roomOn ? 'on' : ''}`} aria-hidden="true">
        {(warm || roomOn) && (
          <Boundary onFail={finish}>
            <Suspense fallback={null}><Room reduce={reduce} onReady={roomReady} play={roomOn} /></Suspense>
          </Boundary>
        )}
        <div className="vig" /><div className="grain" />
      </div>
      <p className="sr-only" aria-live="polite">{roomOn ? 'A dull bedroom. A bed, a desk with a laptop showing a test paper marked 2 out of 30, and a dustbin. The camera moves toward the dustbin.' : ''}</p>
      <div className="gate">
        <button type="button" className="gbtn" autoFocus onClick={() => choose(true)}>
          <span ref={(el) => (labels.current[0] = el)} data-text="begin with audio"><Chars text="begin with audio" base={0} /></span>
        </button>
        <button type="button" className="gbtn" onClick={() => choose(false)}>
          <span ref={(el) => (labels.current[1] = el)} data-text="begin without audio"><Chars text="begin without audio" base={14} /></span>
        </button>
      </div>
      <canvas ref={canvas} className="particles" aria-hidden="true" />
      {skipOn && <button type="button" className="skipbtn" onClick={finish}>skip</button>}
    </div>
  );
}
