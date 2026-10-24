import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /health should return 200 OK with connected database and PostGIS version', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toBeDefined();
    expect(response.body.service).toBe('vit-carpool-api');
    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBeDefined();
    expect(response.body.database.connected).toBe(true);
    expect(response.body.database.postgisInstalled).toBe(true);
    expect(typeof response.body.database.postgisVersion).toBe('string');
    expect(response.body.database.postgisVersion.length).toBeGreaterThan(0);
    expect(typeof response.body.database.latencyMs).toBe('number');
  });
});
