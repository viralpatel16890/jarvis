import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'modelFilter', standalone: true })
export class ModelFilterPipe implements PipeTransform {
  transform(models: string[], type: 'cloud' | 'local'): string[] {
    return models.filter(m =>
      type === 'cloud' ? m.includes(':cloud') : !m.includes(':cloud')
    );
  }
}
