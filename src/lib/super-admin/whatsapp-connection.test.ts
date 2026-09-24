import { describe, expect, it } from 'vitest';

import {
  describeConnectionFlow,
  describeConnectionMode,
  describeDisconnect,
  describeInsights,
  describeModeDrift,
  describePayment,
  describeQuality,
  describeReadiness,
  describeRegistration,
  describeTokenExpiry,
  describeVerification,
  describeWebhook,
} from './whatsapp-connection';

describe('describeConnectionMode', () => {
  it('names Coexistence and what it implies', () => {
    const fact = describeConnectionMode('coexistence');
    expect(fact.label).toBe('Coexistence');
    // The label alone means nothing to a non-specialist, so the consequences
    // have to travel with it.
    expect(fact.detail).toMatch(/phone app/i);
    expect(fact.detail).toMatch(/13 days/);
  });

  it('names pure Cloud API', () => {
    expect(describeConnectionMode('cloud_api').label).toBe('Cloud API');
  });

  it('does not guess for an unrecognised mode', () => {
    expect(describeConnectionMode('something_new').label).toBe('Unknown');
    expect(describeConnectionMode(null).label).toBe('Unknown');
  });
});

describe('describeConnectionFlow', () => {
  it('distinguishes embedded signup from a manual paste', () => {
    expect(describeConnectionFlow('embedded_signup').label).toBe(
      'Embedded Signup'
    );
    expect(describeConnectionFlow('manual').label).toBe('Manual');
  });

  it('flags manual as the riskier setup', () => {
    expect(describeConnectionFlow('manual').tone).toBe('warn');
    expect(describeConnectionFlow('embedded_signup').tone).toBe('good');
  });
});

describe('describeRegistration', () => {
  it('reports a stored error over a past success', () => {
    // A later failure means the CURRENT state is broken, however many times it
    // registered before.
    const fact = describeRegistration({
      registered_at: '2026-09-01T00:00:00Z',
      last_registration_error: 'Meta said no',
    });
    expect(fact.tone).toBe('danger');
    expect(fact.detail).toBe('Meta said no');
  });

  it('reports a clean registration', () => {
    expect(
      describeRegistration({ registered_at: '2026-09-01T00:00:00Z' }).tone
    ).toBe('good');
  });

  /**
   * Coexistence numbers are registered by Meta during onboarding, so a blank
   * `registered_at` is normal. Warning on it would flag every Coexistence
   * tenant as broken.
   */
  it('does not flag a blank registration on Coexistence', () => {
    const fact = describeRegistration({ connection_mode: 'coexistence' });
    expect(fact.tone).toBe('neutral');
    expect(fact.label).toBe('Handled by Meta');
  });

  it('does flag a blank registration on Cloud API', () => {
    expect(describeRegistration({ connection_mode: 'cloud_api' }).tone).toBe(
      'warn'
    );
  });
});

describe('describeWebhook', () => {
  /**
   * THE FALSE ALARM THIS PREVENTS. Verified on a live tenant: our
   * `subscribed_apps_at` was null while Meta listed the app as subscribed,
   * because that column only records calls we made and predates the account.
   * Trusting our own bookkeeping would have shown a red "inbound messages are
   * being lost" on a perfectly healthy connection.
   */
  it('believes Meta over a missing local record', () => {
    const fact = describeWebhook({
      recordedAt: null,
      metaSubscribed: true,
    });
    expect(fact.tone).toBe('good');
    expect(fact.label).toBe('Subscribed');
    expect(fact.detail).toMatch(/normal for older connections/i);
  });

  it('raises a hard alarm only when Meta itself says no', () => {
    const fact = describeWebhook({
      recordedAt: '2026-09-01T00:00:00Z',
      metaSubscribed: false,
    });
    expect(fact.tone).toBe('danger');
    expect(fact.detail).toMatch(/lost silently/i);
  });

  it('falls back to our record when Meta could not be asked', () => {
    const fact = describeWebhook({
      recordedAt: '2026-09-01T00:00:00Z',
      metaSubscribed: null,
    });
    expect(fact.tone).toBe('good');
    // Must not read as a confirmed verdict.
    expect(fact.detail).toMatch(/not reachable/i);
  });

  it('says unconfirmed rather than broken when it knows nothing', () => {
    const fact = describeWebhook({ recordedAt: null, metaSubscribed: null });
    expect(fact.label).toBe('Unconfirmed');
    expect(fact.tone).toBe('warn');
  });
});

describe('describeTokenExpiry', () => {
  const now = new Date('2026-09-17T12:00:00Z');

  /**
   * Null is the HEALTHY end state, not unknown — embedded signup upgrades to a
   * non-expiring system-user token and clears this. Reporting it as unknown
   * would put a permanent question mark on every correct account.
   */
  it('treats no expiry as good', () => {
    const fact = describeTokenExpiry(null, now);
    expect(fact.tone).toBe('good');
    expect(fact.label).toBe('Never expires');
  });

  it('escalates as the deadline approaches', () => {
    expect(describeTokenExpiry('2026-12-17T12:00:00Z', now).tone).toBe('good');
    expect(describeTokenExpiry('2026-10-05T12:00:00Z', now).tone).toBe('warn');
    expect(describeTokenExpiry('2026-09-20T12:00:00Z', now).tone).toBe(
      'danger'
    );
  });

  it('reports an already-expired token as expired', () => {
    const fact = describeTokenExpiry('2026-09-10T12:00:00Z', now);
    expect(fact.label).toBe('Expired');
    expect(fact.tone).toBe('danger');
    expect(fact.detail).toMatch(/7 days ago/);
  });

  it('does not throw on an unparseable timestamp', () => {
    expect(describeTokenExpiry('not-a-date', now).label).toBe('Unknown');
  });
});

describe('describeDisconnect', () => {
  it('returns null when nothing is wrong, so the row can be omitted', () => {
    expect(describeDisconnect({})).toBeNull();
  });

  it('prefers Meta\u2019s reason over its event name', () => {
    const fact = describeDisconnect({
      disconnect_event: 'PARTNER_REMOVED',
      disconnect_reason: 'PRIMARY_INACTIVITY',
    });
    expect(fact?.label).toBe('PRIMARY_INACTIVITY');
    expect(fact?.detail).toMatch(/PARTNER_REMOVED/);
  });
});

describe('describeInsights', () => {
  it('says not available for Coexistence rather than off', () => {
    // "Off" implies it could be turned on. It cannot.
    const fact = describeInsights(null, 'coexistence');
    expect(fact.label).toBe('Not available');
    expect(fact.tone).toBe('neutral');
  });

  it('reports on/off for Cloud API', () => {
    expect(describeInsights('2026-09-17T00:00:00Z', 'cloud_api').label).toBe(
      'On'
    );
    expect(describeInsights(null, 'cloud_api').label).toBe('Off');
  });
});

describe('describePayment', () => {
  /**
   * The honesty requirement. Meta exposes no "is a card attached" field, so
   * `no_issue` must not be presented as confirmation that one exists.
   */
  it('does not claim a payment method exists', () => {
    const fact = describePayment('no_issue');
    expect(fact.tone).toBe('good');
    expect(fact.detail).toMatch(/not confirmation that a card is on file/i);
  });

  it('reports a payment blocker as action required', () => {
    expect(describePayment('action_required').tone).toBe('danger');
  });

  it('stays unknown when Meta said nothing', () => {
    expect(describePayment(undefined).label).toBe('Unknown');
  });
});

describe('describeVerification', () => {
  it('maps each state to the right weight', () => {
    expect(describeVerification('verified').tone).toBe('good');
    expect(describeVerification('pending').tone).toBe('info');
    expect(describeVerification('rejected').tone).toBe('danger');
    expect(describeVerification('not_started').tone).toBe('warn');
    expect(describeVerification(null).label).toBe('Unknown');
  });
});

describe('describeQuality', () => {
  it('translates Meta\u2019s colours', () => {
    expect(describeQuality('GREEN').label).toBe('High');
    expect(describeQuality('YELLOW').tone).toBe('warn');
    expect(describeQuality('RED').tone).toBe('danger');
  });

  it('treats UNKNOWN as not rated rather than a problem', () => {
    const fact = describeQuality('UNKNOWN');
    expect(fact.tone).toBe('neutral');
    expect(fact.label).toBe('Not rated');
  });
});

describe('describeModeDrift', () => {
  it('says nothing when our record agrees with Meta', () => {
    expect(
      describeModeDrift({ storedMode: 'coexistence', isOnBizApp: true })
    ).toBeNull();
    expect(
      describeModeDrift({ storedMode: 'cloud_api', isOnBizApp: false })
    ).toBeNull();
  });

  /**
   * Drift matters because every mode-dependent behaviour — echo handling,
   * insights availability, the 13-day warning — is applied off our stored
   * value, so a mismatch means the wrong rules are running.
   */
  it('flags a stored Cloud API that Meta says is on the phone app', () => {
    const fact = describeModeDrift({
      storedMode: 'cloud_api',
      isOnBizApp: true,
    });
    expect(fact?.tone).toBe('danger');
    expect(fact?.detail).toMatch(/missing Coexistence behaviour/i);
  });

  it('flags a stored Coexistence that Meta says has no phone app', () => {
    const fact = describeModeDrift({
      storedMode: 'coexistence',
      isOnBizApp: false,
    });
    expect(fact?.detail).toMatch(/no phone app attached/i);
  });

  it('says nothing when Meta did not report the field', () => {
    // Absence must not be read as false — that would invent a mismatch on
    // every account whose token cannot read it.
    expect(
      describeModeDrift({ storedMode: 'coexistence', isOnBizApp: null })
    ).toBeNull();
    expect(
      describeModeDrift({ storedMode: 'coexistence', isOnBizApp: undefined })
    ).toBeNull();
  });
});

describe('describeReadiness', () => {
  it('maps Meta\u2019s verdict', () => {
    expect(describeReadiness('available').label).toBe('Can send');
    expect(describeReadiness('limited').tone).toBe('warn');
    expect(describeReadiness('blocked').tone).toBe('danger');
    expect(describeReadiness('unknown').label).toBe('Unknown');
  });
});
