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
      this.preferredVoice =
        this.voices.find(v =>
          v.name.includes('Daniel') ||
          v.name.includes('Google UK English Male') ||
          (v.lang === 'en-GB' && v.name.toLowerCase().includes('male'))
        ) ??
        this.voices.find(v => v.lang.startsWith('en')) ??
        null;
    };
    load();
    this.synth.onvoiceschanged = load;
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
      .replace(/[*_`#]/g, '')
      .replace(/\n+/g, '. ')
      .slice(0, 600);

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.voice = this.preferredVoice;
    utterance.rate = 1.0;
    utterance.pitch = 0.9;
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
