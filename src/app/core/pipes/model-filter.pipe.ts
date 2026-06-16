import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'modelFilter', standalone: true })
export class ModelFilterPipe implements PipeTransform {
  transform(models: string[], type: 'cloud' | 'local'): string[] {
    const isCloud = (m: string) => m.endsWith(':cloud') || m.endsWith('-cloud');
    return models.filter(m => type === 'cloud' ? isCloud(m) : !isCloud(m));
  }
}
