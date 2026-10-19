// Plays session audio. MV3 service workers cannot play sound, so this document does.
import { SoundEngine } from './audio.js';

const engine = new SoundEngine();

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'audio-play') {
    engine.setVolume(msg.volume);
    if (engine.current !== msg.sound) engine.play(msg.sound);
  } else if (msg.type === 'audio-stop') {
    engine.stop();
  } else if (msg.type === 'audio-volume') {
    engine.setVolume(msg.volume);
  } else if (msg.type === 'audio-chime') {
    engine.setVolume(msg.volume == null ? engine.volume : msg.volume);
    engine.chime();
  }
  reply({ ok: true, current: engine.current });
});
