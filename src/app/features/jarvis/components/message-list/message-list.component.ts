import {
  Component, Input, OnChanges, ViewChild,
  ElementRef, AfterViewChecked, SecurityContext
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import { Message } from '../../../../core/models/message.model';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-list.component.html',
  styleUrls: ['./message-list.component.scss'],
})
export class MessageListComponent implements OnChanges, AfterViewChecked {
  @Input() messages: Message[] = [];
  @ViewChild('scrollAnchor') scrollAnchor!: ElementRef;

  private shouldScroll = false;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    this.shouldScroll = true;
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth' });
      this.shouldScroll = false;
    }
  }

  renderMarkdown(text: string): string {
    const raw = marked.parse(text, { async: false }) as string;
    return this.sanitizer.sanitize(SecurityContext.HTML, raw) ?? text;
  }

  trackById(_: number, msg: Message): string {
    return msg.id;
  }
}
