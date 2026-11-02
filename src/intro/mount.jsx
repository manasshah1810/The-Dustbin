import { createRoot } from 'react-dom/client';
import Intro from './Intro.jsx';

export function mountIntro() {
  const host = document.getElementById('intro');
  const root = createRoot(host);
  const onDone = () => {
    dispatchEvent(new CustomEvent('dustbin:done'));
    host.classList.add('gone');
    setTimeout(() => { root.unmount(); host.remove(); document.body.classList.remove('speaker-on'); }, 1000);
  };
  root.render(<Intro onDone={onDone} />);
}
