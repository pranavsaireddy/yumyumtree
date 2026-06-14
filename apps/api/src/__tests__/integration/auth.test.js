'use strict';

// describe/it/expect/vi/afterEach are globals (vitest.config.js → test.globals).
const request = require('supertest');

const app = require('../../app');
const supabase = require('../../lib/supabase');

// Pure HTTP against POST /api/auth/sync with the Supabase client fully mocked — no real DB,
// no real Auth call. So no assertSafeTestDb fence is needed (nothing touches the database).
describe('POST /api/auth/sync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('401 UNAUTHENTICATED when no Authorization header is sent', async () => {
    const res = await request(app).post('/api/auth/sync').send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('401 UNAUTHENTICATED when the token is invalid (getUser returns no user)', async () => {
    const getUserSpy = vi
      .spyOn(supabase.auth, 'getUser')
      .mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });

    const res = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', 'Bearer bogus-token')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
    expect(getUserSpy).toHaveBeenCalledWith('bogus-token');
  });

  it('200 and upserts using the TOKEN identity, ignoring any body identity fields', async () => {
    // The verified user the JWT resolves to — the ONLY source of truth for identity.
    const tokenUser = {
      id: 'uid-from-token',
      email: 'real@user.com',
      user_metadata: { full_name: 'Real User' },
    };
    const getUserSpy = vi
      .spyOn(supabase.auth, 'getUser')
      .mockResolvedValue({ data: { user: tokenUser }, error: null });

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({ upsert });

    const res = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', 'Bearer valid-token')
      // Body carries a DIFFERENT, attacker-controlled identity — it must be ignored entirely.
      .send({ id: 'attacker-uid', email: 'attacker@evil.com', name: 'Mallory' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // Token was passed straight through to Supabase for verification.
    expect(getUserSpy).toHaveBeenCalledWith('valid-token');

    // The upsert used the token identity — never the spoofed body fields.
    expect(fromSpy).toHaveBeenCalledWith('customers');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, options] = upsert.mock.calls[0];
    expect(row).toEqual(
      expect.objectContaining({
        id: 'uid-from-token',
        email: 'real@user.com',
        name: 'Real User',
      })
    );
    expect(options).toEqual(expect.objectContaining({ onConflict: 'id' }));
    expect(row.id).not.toBe('attacker-uid');
    expect(row.email).not.toBe('attacker@evil.com');
  });

  it('502 CUSTOMER_SYNC_FAILED when the upsert errors (token is still valid)', async () => {
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: { user: { id: 'uid-1', email: 'a@b.com', user_metadata: {} } },
      error: null,
    });
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'db down' } });
    vi.spyOn(supabase, 'from').mockReturnValue({ upsert });

    const res = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('CUSTOMER_SYNC_FAILED');
  });
});
