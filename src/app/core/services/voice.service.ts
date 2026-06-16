import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

declare var SpeechRecognition: any;
declare var webkitSpeechRecognition: any;

const WAKE_WORDS = ['hey jarvis', 'jarvis', 'ok jarvis'];

@Injectable({ providedIn: 'root' })
export class VoiceService implements OnDestroy {
  readonly isListening$ = new BehaviorSubject<boolean>(false);
  readonly isSpeaking$ = new BehaviorSubject<boolean>(false);
  readonly transcript$ = new BehaviorSubject<string>('');
  readonly wakeWordDetected$ = new BehaviorSubject<boolean>(false);

  private recognition: any = null;
  private synth = window.speechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private wakeWordMode = false;
  private onResult?: (text: string) => void;

  constructor(private zone: NgZone) {
    this.initVoices();
  }

  get isSupported(): boolean {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  private initVoices(): void {
    const load = () => {
      this.voices = this.synth.getVoices();
      this.preferredVoice = this.pickJarvisVoice();
    };
    load();
    this.synth.onvoiceschanged = load;
  }

  // Priority: Microsoft Natural UK male → Daniel (macOS) → Google UK Male → any en-GB → any en
  private pickJarvisVoice(): SpeechSynthesisVoice | null {
    const v = this.voices;
    return (
      v.find(x => /Microsoft Ryan Online/i.test(x.name))    ||
      v.find(x => /Microsoft Alfie Online/i.test(x.name))   ||
      v.find(x => /Microsoft Ollie Online/i.test(x.name))   ||
      v.find(x => /Microsoft Thomas Online/i.test(x.name))  ||
      v.find(x => /Microsoft George/i.test(x.name))         ||
      v.find(x => x.name === 'Daniel')                       ||
      v.find(x => /Google UK English Male/i.test(x.name))   ||
      v.find(x => x.lang === 'en-GB')                        ||
      v.find(x => x.lang.startsWith('en'))                   ||
      null
    );
  }

  startListening(onResult: (text: string) => void, wakeWordMode = false): void {
    if (!this.isSupported || this.isListening$.value) return;
    this.onResult = onResult;
    this.wakeWordMode = wakeWordMode;

    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = wakeWordMode;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.zone.run(() => this.isListening$.next(true));
    };

    this.recognition.onresult = (event: any) => {
      const text: string = Array.from(event.results as SpeechRecognitionResultList)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(' ')
        .trim()
        .toLowerCase();

      this.zone.run(() => this.transcript$.next(text));

      if (wakeWordMode) {
        const hasWake = WAKE_WORDS.some(w => text.includes(w));
        if (hasWake) {
          const cleaned = WAKE_WORDS.reduce((t, w) => t.replace(w, ''), text).trim();
          this.zone.run(() => this.wakeWordDetected$.next(true));
          if (cleaned && onResult) this.zone.run(() => onResult(cleaned));
        }
      } else {
        if (onResult) this.zone.run(() => onResult(text));
      }
    };

    this.recognition.onerror = () => {
      this.zone.run(() => this.isListening$.next(false));
    };

    this.recognition.onend = () => {
      this.zone.run(() => {
        this.isListening$.next(false);
        this.wakeWordDetected$.next(false);
        if (wakeWordMode) {
          setTimeout(() => this.startListening(onResult, true), 500);
        }
      });
    };

    this.recognition.start();
  }

  stopListening(): void {
    this.wakeWordMode = false;
    this.recognition?.stop();
    this.isListening$.next(false);
  }

  speak(text: string): void {
    if (!text.trim()) return;
    this.synth.cancel();

    const clean = text
      .replace(/```[\s\S]*?```/g, 'code block omitted')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')          // [label](url) → label
      .replace(/https?:\/\/\S+/g, 'link')               // bare URLs → "link"
      .replace(/[*_`#>]/g, '')
      .replace(/&[a-z]+;/g, '')                         // HTML entities
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 900);

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.voice = this.preferredVoice;
    utterance.rate = 0.88;   // measured, deliberate — JARVIS never rushes
    utterance.pitch = 0.85;  // deeper, authoritative British tone
    utterance.volume = 1;

    utterance.onstart = () => this.zone.run(() => this.isSpeaking$.next(true));
    utterance.onend = () => this.zone.run(() => this.isSpeaking$.next(false));
    utterance.onerror = () => this.zone.run(() => this.isSpeaking$.next(false));

    this.synth.speak(utterance);
    this.isSpeaking$.next(true);
  }

  stopSpeaking(): void {
    this.synth.cancel();
    this.isSpeaking$.next(false);
  }

  ngOnDestroy(): void {
    this.stopListening();
    this.stopSpeaking();
  }
}
