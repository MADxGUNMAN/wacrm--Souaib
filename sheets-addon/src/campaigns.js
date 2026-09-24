/**
 * campaigns.js — reads API campaigns from the CRM.
 *
 * Two calls, deliberately split by the CRM (see docs/public-api.md):
 * `/campaigns` returns just enough to fill a picker, and
 * `/campaigns/{id}` adds what the chosen template actually needs to
 * send. The wizard follows the same split — it lists on entry to step 2
 * and looks one up only when the user picks it.
 */
const ReplaiCampaigns = {
  /** Server default is 50 per page, capped at 100. */
  PAGE_SIZE: 100,

  /**
   * Stop after this many pages. A picker no one can scroll is not more
   * useful than a truncated one, and an unbounded loop inside Apps
   * Script's 6-minute budget is a way to lose the whole run.
   */
  MAX_PAGES: 5,

  /**
   * Every campaign the key can see, active ones first.
   *
   * @returns {{ok: boolean, campaigns: Array, truncated: boolean,
   *            code: string, message: string}}
   */
  list: function () {
    const campaigns = [];
    let cursor = '';
    let truncated = false;

    for (let page = 0; page < ReplaiCampaigns.MAX_PAGES; page++) {
      const path =
        '/campaigns?limit=' +
        ReplaiCampaigns.PAGE_SIZE +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');

      const result = ReplaiApi.get(path);
      if (!result.ok) {
        return {
          ok: false,
          campaigns: [],
          truncated: false,
          code: result.code,
          message: ReplaiAuth.explain_(result),
        };
      }

      const rows = result.data || [];
      for (let i = 0; i < rows.length; i++) {
        campaigns.push({
          id: rows[i].id,
          name: rows[i].name,
          templateName: rows[i].template_name,
          templateLanguage: rows[i].template_language,
          status: rows[i].status,
        });
      }

      cursor = (result.meta && result.meta.next_cursor) || '';
      if (!cursor) break;
      if (page === ReplaiCampaigns.MAX_PAGES - 1) truncated = true;
    }

    // A paused campaign refuses to send (403 campaign_paused), so it is
    // shown but sorted below the usable ones rather than hidden — hiding
    // it makes a campaign the user can see in the CRM look missing here.
    campaigns.sort(function (a, b) {
      if (a.status === b.status) return 0;
      return a.status === 'active' ? -1 : 1;
    });

    return {
      ok: true,
      campaigns: campaigns,
      truncated: truncated,
      code: '',
      message: '',
    };
  },

  /**
   * One campaign plus what its template needs: how many body variables,
   * and whether it has a media header that must be filled.
   *
   * The media part matters more than it looks. A template with an IMAGE
   * header and no media supplied is rejected by Meta for every single
   * recipient, so the wizard needs to know at configuration time rather
   * than discovering it one failed broadcast later.
   */
  get: function (campaignId) {
    const result = ReplaiApi.get(
      '/campaigns/' + encodeURIComponent(campaignId)
    );

    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message:
          result.code === 'not_found'
            ? 'That campaign no longer exists in Replai.'
            : ReplaiAuth.explain_(result),
      };
    }

    const data = result.data || {};
    const template = data.template || {};
    const header = template.header || null;

    return {
      ok: true,
      code: '',
      message: '',
      campaign: {
        id: data.id,
        name: data.name,
        templateName: data.template_name,
        templateLanguage: data.template_language,
        status: data.status,
        variableCount: template.body_variable_count || 0,
        // Named templates label their placeholders; positional ones give
        // an empty array and the wizard falls back to {{1}}, {{2}}, …
        variableNames: template.body_variable_names || [],
        media: {
          format: header ? header.format : '',
          required: !!(header && header.requires_media),
          defaultUrl: (header && header.default_url) || '',
        },
        // Set by the CRM when the local copy of the template is stale or
        // the template was deleted in Meta. Surfaced verbatim: it is the
        // difference between "this rule will work" and "this rule will
        // fail at send time for reasons invisible here".
        warning: data.template_warning || '',
      },
    };
  },

  /** Maps a Meta header format onto the wizard's media type ids. */
  mediaTypeForFormat: function (format) {
    switch (String(format || '').toUpperCase()) {
      case 'IMAGE':
        return 'image';
      case 'DOCUMENT':
        return 'document';
      case 'VIDEO':
        return 'video';
      default:
        return 'none';
    }
  },
};
