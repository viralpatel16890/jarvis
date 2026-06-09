import {
  Component, Input, OnChanges, OnDestroy, OnInit,
  ElementRef, ViewChild, SimpleChanges, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { JarvisState } from '../../../../core/models/message.model';

@Component({
  selector: 'app-arc-reactor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './arc-reactor.component.html',
  styleUrls: ['./arc-reactor.component.scss'],
})
export class ArcReactorComponent implements OnInit, OnChanges, OnDestroy {
  @Input() state: JarvisState = 'idle';
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private animationId = 0;
  private angle = 0;
  private pulse = 0;
  private pulseDir = 1;

  private readonly SIZE = 200;
  private readonly COLORS: Record<JarvisState, { primary: string; secondary: string; glow: string }> = {
    idle:      { primary: '#00d4ff', secondary: '#0060c0', glow: 'rgba(0, 212, 255, 0.4)' },
    listening: { primary: '#00ff88', secondary: '#00a050', glow: 'rgba(0, 255, 136, 0.6)' },
    thinking:  { primary: '#f0a000', secondary: '#c06000', glow: 'rgba(240, 160, 0, 0.6)' },
    speaking:  { primary: '#00d4ff', secondary: '#8040ff', glow: 'rgba(128, 64, 255, 0.7)' },
  };

  constructor(private zone: NgZone) {}

  ngOnInit(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = this.SIZE;
    canvas.height = this.SIZE;
    this.ctx = canvas.getContext('2d')!;
    this.zone.runOutsideAngular(() => this.animate());
  }

  ngOnChanges(_: SimpleChanges): void {
    this.pulse = 0;
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.draw();

    const speed = this.state === 'thinking' ? 0.04
                : this.state === 'speaking' ? 0.025
                : this.state === 'listening' ? 0.015
                : 0.008;
    this.angle += speed;

    this.pulse += this.pulseDir * 0.03;
    if (this.pulse > 1) { this.pulse = 1; this.pulseDir = -1; }
    if (this.pulse < 0) { this.pulse = 0; this.pulseDir = 1; }
  }

  private draw(): void {
    const { ctx } = this;
    const cx = this.SIZE / 2;
    const cy = this.SIZE / 2;
    const c = this.COLORS[this.state];

    ctx.clearRect(0, 0, this.SIZE, this.SIZE);

    // Outer glow
    const glowRadius = 90 + this.pulse * 8;
    const outerGlow = ctx.createRadialGradient(cx, cy, 60, cx, cy, glowRadius);
    outerGlow.addColorStop(0, c.glow);
    outerGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = outerGlow;
    ctx.fillRect(0, 0, this.SIZE, this.SIZE);

    // Outer ring
    this.drawRing(cx, cy, 88, 3, c.primary, 0.8 + this.pulse * 0.2);

    // Tick marks on outer ring
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const len = i % 3 === 0 ? 10 : 5;
      const r1 = 84, r2 = r1 - len;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.strokeStyle = c.primary;
      ctx.lineWidth = i % 3 === 0 ? 2 : 1;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Rotating outer ring segments
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, 72, a, a + Math.PI / 10);
      ctx.strokeStyle = c.primary;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.5 + this.pulse * 0.3;
      ctx.stroke();
    }
    ctx.restore();

    // Counter-rotating ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.angle * 1.5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, 58, a, a + Math.PI / 14);
      ctx.strokeStyle = c.secondary;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 + this.pulse * 0.2;
      ctx.stroke();
    }
    ctx.restore();

    // Middle ring
    this.drawRing(cx, cy, 46, 2, c.primary, 0.7);

    // Inner hexagon
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle * 0.5);
    this.drawHexagon(0, 0, 32, c.primary, c.glow);
    ctx.restore();

    // Core glow
    const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22 + this.pulse * 4);
    coreGlow.addColorStop(0, '#ffffff');
    coreGlow.addColorStop(0.3, c.primary);
    coreGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 22 + this.pulse * 4, 0, Math.PI * 2);
    ctx.fill();

    // Core circle
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.9 + this.pulse * 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawRing(cx: number, cy: number, r: number, w: number, color: string, alpha: number): void {
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = w;
    this.ctx.globalAlpha = alpha;
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  }

  private drawHexagon(x: number, y: number, r: number, stroke: string, fill: string): void {
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      const px = x + r * Math.cos(a);
      const py = y + r * Math.sin(a);
      i === 0 ? this.ctx.moveTo(px, py) : this.ctx.lineTo(px, py);
    }
    this.ctx.closePath();
    this.ctx.fillStyle = fill;
    this.ctx.globalAlpha = 0.3;
    this.ctx.fill();
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 2;
    this.ctx.globalAlpha = 0.9;
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  }
}
