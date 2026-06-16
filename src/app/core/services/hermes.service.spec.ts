import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HermesService } from './hermes.service';
import { SettingsService } from './settings.service';

const BASE = 'http://localhost:5001';
const mockSettings = { get: () => ({ hermesBaseUrl: BASE }) };

describe('HermesService', () => {
  let service: HermesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        HermesService,
        { provide: SettingsService, useValue: mockSettings },
      ],
    });
    service = TestBed.inject(HermesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('checkHealth', () => {
    it('returns degraded health object on HTTP error', () => {
      let result: any;
      service.checkHealth().subscribe(r => (result = r));
      http.expectOne(`${BASE}/health`).flush('', { status: 500, statusText: 'Error' });
      expect(result).toEqual({ ok: false, hermesInstalled: false, hermesVersion: null, bridge: '' });
    });

    it('returns the server payload on success', () => {
      let result: any;
      const payload = { ok: true, hermesInstalled: true, hermesVersion: '1.2.3', bridge: 'active' };
      service.checkHealth().subscribe(r => (result = r));
      http.expectOne(`${BASE}/health`).flush(payload);
      expect(result).toEqual(payload);
    });
  });

  describe('isBridgeRunning', () => {
    it('returns true when health.ok is true', () => {
      let running: boolean | undefined;
      service.isBridgeRunning().subscribe(r => (running = r));
      http.expectOne(`${BASE}/health`).flush({ ok: true, hermesInstalled: true, hermesVersion: '1.0', bridge: 'active' });
      expect(running).toBe(true);
    });

    it('returns false when bridge is down', () => {
      let running: boolean | undefined;
      service.isBridgeRunning().subscribe(r => (running = r));
      http.expectOne(`${BASE}/health`).flush('', { status: 503, statusText: 'Down' });
      expect(running).toBe(false);
    });
  });

  describe('getSkills', () => {
    it('returns skills array from server', () => {
      let skills: string[] | undefined;
      service.getSkills().subscribe(r => (skills = r));
      http.expectOne(`${BASE}/skills`).flush({ skills: ['web-search', 'code-runner'] });
      expect(skills).toEqual(['web-search', 'code-runner']);
    });

    it('returns empty array on error', () => {
      let skills: string[] | undefined;
      service.getSkills().subscribe(r => (skills = r));
      http.expectOne(`${BASE}/skills`).flush('', { status: 503, statusText: 'Unavailable' });
      expect(skills).toEqual([]);
    });
  });
});
