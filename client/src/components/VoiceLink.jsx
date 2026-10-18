import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

// Two-way voice, available only while a confirmed incident is open.
//
// Deliberately not a conversational agent: no model, no transcription, no
// always-on microphone. The caregiver opens a channel to the room the elder
// actually fell in, because ringing a phone across the room does not help.

export default function VoiceLink({ incident, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(null);

  const voice = incident.voice;
  const live = voice?.state === 'live';

  useEffect(() => {
    if (!live) {
      setElapsed(0);
      startedRef.current = null;
      return;
    }
    startedRef.current = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [live]);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const { incident: updated } = await api.startVoice(incident.id);
      onUpdate?.(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      const { incident: updated } = await api.endVoice(incident.id, elapsed);
      onUpdate?.(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className={`voice-link ${live ? 'live' : ''}`}>
      <div className="voice-link__head">
        <div>
          <div className="voice-link__title">
            {live ? 'Voice channel open' : 'Speak to the room'}
            {live && <span className="voice-link__dot" aria-hidden="true" />}
          </div>
          <div className="voice-link__sub">
            {live
              ? `Live to ${incident.room} · ${mm}:${ss} · not being recorded`
              : `Talk to ${incident.elder?.name?.split(' ')[0] ?? 'her'} through the ${incident.room?.toLowerCase() ?? 'room'} device, rather than a phone she may not be able to reach.`}
          </div>
        </div>
        {live ? (
          <button className="btn danger small" disabled={busy} onClick={close}>
            End call
          </button>
        ) : (
          <button className="btn primary small" disabled={busy} onClick={open}>
            🎙 Talk to {incident.elder?.name?.split(' ')[0] ?? 'her'}
          </button>
        )}
      </div>

      {error && <div className="voice-link__error">{error}</div>}

      {voice?.state === 'ended' && !error && (
        <div className="voice-link__ended">
          Previous call lasted {voice.durationSeconds}s. No audio was recorded or transcribed.
        </div>
      )}

      <p className="voice-link__note">
        🎙 The microphone is inert outside an open incident. There is no wake word, no listening mode, and no
        speech is stored — only the fact that a call happened, for the audit trail.
      </p>
    </div>
  );
}
