// ─────────────────────────────────────────────────────────────────────
// English — the canonical dictionary. Every other locale is typed
// against these keys (Record<MessageKey, string>), so adding a key here
// without translating it is a compile error, and adding a new language
// is just one new file that satisfies the type.
//
// Interpolation: {name} placeholders are replaced by t(key, { name }).
// Legal output (RA-89 fill, AI-drafted complaint text, companion-doc
// PDF) is intentionally NOT keyed here — it must stay in English.
// ─────────────────────────────────────────────────────────────────────

export const en = {
  // ── App chrome ────────────────────────────────────────────────────
  'app.title': 'Am I Rent Stabilized?',
  'nav.info': 'Info',
  'nav.home': 'Home',
  'nav.reset': 'Reset',
  'nav.resetTitle': 'Start over with a new address',
  'nav.language': 'Language',

  // ── Common ────────────────────────────────────────────────────────
  'common.selectOne': '— select one —',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.optional': '(optional)',

  // ── Hero (home page) ──────────────────────────────────────────────
  'hero.kicker': 'A public lookup for NYC tenants',
  'hero.headline': 'Check any New York building for rent-stabilized units.',
  'hero.sub':
    'Search an address. We fly the map to the building, check it against DHCR and NYCDB, and — if it has registered stabilized units — turn your lease history into a draftable overcharge complaint.',
  'hero.stat.units': 'Stabilized units',
  'hero.stat.window': 'HSTPA window',
  'hero.stat.orders': 'RGB orders modeled',

  // ── Map overlay (home page) ───────────────────────────────────────
  'map.nyc': 'New York City',
  'map.approaching': 'Approaching',
  'map.located': 'Building located',
  'map.boroughs': '5 boroughs · ~1M stabilized units',
  'map.idleReadout': 'Globe view · idle',
  'map.flying': 'flying',
  'map.arrived': 'arrived',
  'map.standby': 'standby',
  'map.viewVerdict': 'View verdict ↓',
  'map.howTitle': 'How this works',
  'map.how1': 'Search any NYC address — we’ll fly there.',
  'map.how2': 'The building is checked against DHCR + NYCDB.',
  'map.how3': 'Add your lease history to estimate overcharge.',
  'map.how4': 'Draft a DHCR Form RA-89 complaint in plain English.',

  // ── Progress / loading states (home page) ─────────────────────────
  'status.locating': 'Locating',
  'status.approaching': 'Approaching',
  'status.flyingMsg': 'Flying the camera in — verdict will appear when we land.',
  'status.checkingMsg': 'Cross-checking the BBL against the DHCR + NYCDB record…',
  'status.calculating': 'Calculating',
  'status.walkingMsg': 'Walking your lease history forward through every RGB order…',

  // ── Errors ────────────────────────────────────────────────────────
  'error.lookupFailed': 'Lookup failed',
  'error.estimateFailed': 'Estimate failed',
  'error.generic': 'Something went wrong. Please try again.',

  // ── Stage stepper ─────────────────────────────────────────────────
  'stepper.step': 'Step {n}',
  'stepper.locate': 'Locate',
  'stepper.verdict': 'Verdict',
  'stepper.estimate': 'Estimate',
  'stepper.draft': 'Draft',

  // ── Address search ────────────────────────────────────────────────
  'search.label': 'Address',
  'search.placeholderHero': 'e.g. 350 West 50th Street',
  'search.placeholder': 'Enter a NYC address…',

  // ── Demo addresses ────────────────────────────────────────────────
  'demo.tryOne': 'Or try one',
  'demo.loading': 'Loading…',
  'demo.resolveError': 'Couldn’t resolve “{query}”.',
  'demo.hint.hellsKitchen': 'Hell’s Kitchen — pre-war',
  'demo.hint.uws': 'Upper West Side — UWS',
  'demo.hint.murrayHill': 'Murray Hill — mid-rise',

  // ── Result card (verdict) ─────────────────────────────────────────
  'result.eyebrow': 'Verdict · Section II',
  'result.stabilized.badge': 'Registered stabilized units',
  'result.stabilized.headline': 'This building has registered rent-stabilized units.',
  'result.stabilized.sub':
    'That doesn’t confirm your apartment is one of them — DHCR and NYCDB records are building-level. Request your apartment’s rent history from DHCR (Form REC-1) to confirm.',
  'result.notListed.badge': 'Not listed',
  'result.notListed.headline': 'No stabilization record found for this building.',
  'result.notListed.sub':
    'DHCR records lag by 1–2 years and some stabilized buildings (recent 421-a / J-51) may not appear. Cross-check with DHCR before concluding.',
  'result.unknown.badge': 'Likely no stabilized units',
  'result.unknown.headline': 'This building probably has no rent-stabilized units.',
  'result.unknown.sub':
    'We didn’t find your address on the DHCR list or in the NYCDB rent-stabilization dataset. Buildings outside these records are usually condos, co-ops, single/two-family homes, or post-1974 construction — none of which are typically rent-stabilized. To be 100% sure, verify directly with DHCR.',
  'result.onDhcrList': 'On DHCR list',
  'result.recentEvidence': 'Most recent evidence',
  'result.verifyDhcr': 'Verify on DHCR',
  'result.requestRec1': 'Request rent history (REC-1)',
  'result.disclaimer':
    'Informational only — NYCDB rentstab coverage runs through ~2023. Always verify your apartment’s status directly with DHCR.',

  // ── Rent history form ─────────────────────────────────────────────
  'form.eyebrow': 'Section III · Lease history',
  'form.title': 'Compare each renewal against the legal RGB increase.',
  'form.sub':
    'Enter every lease you’ve signed at this apartment. We’ll walk it forward year-by-year against NYC Rent Guidelines Board orders and surface any year where rent rose above the legal cap.',
  'form.col.start': 'Lease start',
  'form.col.end': 'Lease end',
  'form.col.rent': 'Monthly rent',
  'form.col.term': 'Term',
  'form.ph.start': 'Start date',
  'form.ph.end': 'End date',
  'form.term.other': 'Other',
  'form.term.1yr': '1-year',
  'form.term.2yr': '2-year',
  'form.removeLease': 'Remove lease',
  'form.addLease': 'Add another lease',
  'form.err.atLeastOne': 'Add at least one lease (start, rent, term).',
  'form.err.endAfterStart': 'Lease starting {date} must end after it starts.',
  'form.submit': 'Estimate overcharge',
  'form.calculating': 'Calculating…',

  // ── Overcharge summary ────────────────────────────────────────────
  'summary.eyebrow': 'Section III · Estimate',
  'summary.overchargedLead':
    'You’ve been overcharged {current} as of today. If this remains unchecked, the first rent hike that becomes actionable starts with the lease beginning on {date}, and you are set to be overcharged {total} by the end of your final lease.',
  'summary.firstOverchargeFallback': 'the first overcharged renewal',
  'summary.noneLead': 'No overcharge detected',
  'summary.withinLimits': 'All within RGB increase limits.',
  'summary.badge.over': 'Overcharge',
  'summary.badge.within': 'Within bounds',
  'summary.stat.current': 'Your current rent',
  'summary.stat.legal': 'Estimated legal rent',
  'summary.stat.monthly': 'Monthly overcharge',
  'summary.perMonth': '/mo',
  'summary.breakdown': 'Per-renewal breakdown',
  'summary.th.leaseStart': 'Lease start',
  'summary.th.term': 'Term',
  'summary.th.allowed': 'Allowed',
  'summary.th.actual': 'Actual',
  'summary.th.legalRent': 'Legal rent',
  'summary.th.actualRent': 'Actual rent',
  'summary.th.overMo': 'Overcharge / mo',
  'summary.th.inWindow': 'In 6-yr window',
  'summary.term1': '1-yr',
  'summary.term2': '2-yr',
  'summary.caveats': 'Caveats and assumptions',
  'summary.notes': '{n} notes',
  'summary.disclaimerPre':
    'Estimate only — not legal advice. To confirm the starting legal rent, request your apartment’s rent history via ',
  'summary.disclaimerLink': 'DHCR Records Access (Form REC-1)',
  'summary.disclaimerPost':
    '. This is not a law firm and use of this tool does not create an attorney-client relationship. Not affiliated with or endorsed by DHCR or any NY state agency.',

  // ── Complaint preview (Section IV) ────────────────────────────────
  'draft.eyebrow': 'Section IV · Filing packet',
  'draft.titleReady': 'Your packet is ready.',
  'draft.titleBuild': 'Build your filing packet.',
  'draft.subReady': 'A multi-page PDF you attach to the official RA-89 form. Preview, download, or send below.',
  'draft.subBuildPre': 'A polished PDF you attach to ',
  'draft.subBuildLink': 'DHCR Form RA-89',

  'draft.futureLease.important': 'Important',
  'draft.futureLease.p1':
    'You can still draft an RA-89 packet now, but if your new lease has not started yet, this is only a projection. The form will only matter once the new lease begins.',
  'draft.futureLease.whatNow': 'What to do now:',
  'draft.futureLease.s1t': 'Document everything.',
  'draft.futureLease.s1b':
    'Keep the signed lease, any rent increase notices, and the date the new rent starts. Get your DHCR rent history (Form REC-1).',
  'draft.futureLease.s2t': 'Try to fix it before the lease starts.',
  'draft.futureLease.s2b':
    'Ask the landlord to renegotiate the rent or remove the increase. If you haven’t moved in yet, you may be able to back out or delay the start depending on local tenant law.',
  'draft.futureLease.s3t': 'Prepare to file later.',
  'draft.futureLease.s3b':
    'If the new lease actually starts and you begin paying the higher rent, then the overcharge can become actionable. The complaint would cover the period after the lease starts, not the weeks before it.',
  'draft.futureLease.s4t': 'Seek advice.',
  'draft.futureLease.s4b':
    'Talk to a tenant counselor, legal aid, or tenant union in NYC. They can tell you whether the lease is binding and whether there’s a path to cancel or renegotiate.',

  'draft.quickFill': 'Quick fill',
  'draft.essentials': '3 essentials',
  'draft.fullName': 'Your full name',
  'draft.fullNamePh': 'Jane Tenant',
  'draft.phoneDay': 'Phone (daytime)',
  'draft.ownerBlock': 'Owner / managing agent',
  'draft.hpdLooking': 'Looking up HPD…',
  'draft.hpdMatch': '✓ HPD match',
  'draft.hpdNone': 'No HPD record — find on your lease',
  'draft.ownerName': 'Name',
  'draft.ownerNamePh': 'ACME Realty LLC',
  'draft.ownerAddress': 'Mailing address',
  'draft.ownerAddressPh': '100 Main St, New York, NY 10001',

  'draft.customize': 'Customize',
  'draft.customizeHint': '(unit, mailing address, tone, causes…)',
  'draft.moreAboutYou': 'More about you',
  'draft.unit': 'Apartment unit',
  'draft.phoneHome': 'Phone (home)',
  'draft.mailingSame': 'Mailing address is the same as the subject building.',
  'draft.mailingStreet': 'Mailing street + apt',
  'draft.mailingStreetPh': '123 Other St, Apt 2A',
  'draft.city': 'City',
  'draft.state': 'State',
  'draft.zip': 'ZIP',

  'draft.tone': 'Tone',
  'draft.toneHint': 'Adjusts wording in the §14 statement only.',
  'draft.tone.neutral': 'neutral',
  'draft.tone.assertive': 'assertive',
  'draft.tone.conciliatory': 'conciliatory',

  'draft.causes': 'Causes (RA-89 §13) — required',
  'draft.causesHint':
    'A cause is the reason you are filing the RA-89 complaint. Check at least one option that matches why your rent or charges are wrong.',
  'cause.other': 'Other (rent increase above the RGB legal ceiling. Select if there was an overcharge calculated.)',
  'cause.mci': 'MCI increase (There was a rent hike because your whole building was improved)',
  'cause.iai': 'IAI increase (There was a rent hike because your specific apartment was improved)',
  'cause.fmra': 'FMRA (Landlord increased rent before registration)',
  'cause.rro': 'Rent Reduction Order outstanding (landlord did not lower rent after DHCR order)',
  'cause.missingReg': 'Missing registrations (landlord failed to register the rent)',
  'cause.parking': 'Parking charges (illegal or excessive parking fees)',
  'cause.illegalFees': 'Illegal fees / surcharges (unauthorized extra charges)',
  'cause.secDeposit': 'Security deposit > 1 month (landlord charged more than one month’s deposit)',

  'draft.secDep': 'Security deposit (§15) — required',
  'draft.secDepHint':
    'You flagged an excess security deposit. Enter what you paid the landlord and when — both are required for RA-89 §15.',
  'draft.secDepPaid': 'Security deposit paid *',
  'draft.secDepDate': 'Date paid *',
  'draft.secDepVacated': 'If you vacated the apartment, did you use your security deposit to pay part of the rent?',

  'draft.required': 'Required (tenant type, SCRIE/DRIE, Section 8, electricity)',
  'draft.requiredHint': 'These affect which RA-89 boxes get checked — answer every one, even if the answer is “No”.',
  'draft.tenantType': 'Tenant type *',
  'draft.tenantType.prime': 'Prime tenant',
  'draft.tenantType.sub': 'Sub-tenant',
  'draft.tenantType.roommate': 'Roommate',
  'draft.tenantType.hotel': 'Hotel / SRO tenant',
  'draft.section8': 'Section 8 *',
  'draft.section8.none': 'None',
  'draft.section8.hud': 'HUD',
  'draft.section8.nycha': 'NYCHA',
  'draft.section8.hcv': 'Housing Choice Voucher',
  'draft.section8.hpd': 'HPD',
  'draft.electricity': 'Electricity in rent *',
  'draft.electricity.yes': 'Yes, included',
  'draft.electricity.no': 'No, billed separately',
  'draft.scrieDrie': 'SCRIE / DRIE recipient *',
  'draft.coop': 'Co-op apartment',

  'draft.payee': 'Who you pay rent to (§12)',
  'draft.payeeHint':
    'If you pay rent to someone other than the owner (like the prime tenant), fill in who — this goes in RA-89 §12. Leave blank if you pay the owner directly.',
  'draft.payeeName': 'Their name',
  'draft.payeeStreet': 'Their street address',
  'draft.payeeStreetPh': '123 Main St, Apt 2A',
  'draft.payeeCityStateZip': 'City, State ZIP',
  'draft.payeePhone': 'Their phone number',

  'draft.noLease': 'Initially moved in without written lease',
  'draft.noLeaseRent': 'Initial rent (no lease)',
  'draft.court': 'This complaint has been raised in court',
  'draft.courtIndex': 'Court Index No.',

  'draft.missingSoft':
    'Still missing: {items}. Packet will generate with blanks for you to write in by hand.',
  'draft.missingHard': 'Still required: {items}.',
  'missing.yourName': 'your name',
  'missing.phone': 'a phone number',
  'missing.owner': 'owner info',
  'missing.initialRent': 'your initial rent (no lease)',
  'missing.tenantType': 'tenant type',
  'missing.scrieDrie': 'SCRIE/DRIE status',
  'missing.section8': 'Section 8 status',
  'missing.electricity': 'electricity in rent',
  'missing.cause': 'at least one cause (§13)',
  'missing.secDepAmount': 'security deposit amount',
  'missing.secDepDate': 'security deposit date',

  'draft.generate': 'Generate my filing packet',
  'draft.drafting': 'Drafting…',
  'draft.stop': 'Stop',
  'draft.via': 'via {provider}',

  'draft.downloadRa89': 'Download RA-89 (filled)',
  'draft.fillingForm': 'Filling form…',
  'draft.companionDoc': 'Companion doc',
  'draft.sendGmail': 'Send via Gmail',
  'draft.openMail': 'Open in Mail',
  'draft.print': 'Print',
  'draft.copyText': 'Copy text',
  'draft.copied': 'Copied',
  'draft.redraft': '↻ Redraft',
  'draft.emailNote':
    'Email opens a compose window with a pre-filled subject and message. Attach the downloaded PDF in your mail client.',
  'draft.renderingPdf': 'Rendering your PDF…',
  'draft.pdfTitle': 'RA-89 Filing Packet for BBL {bbl}',

  'draft.next.kicker': 'What to do next',
  'draft.next.meta': '4 steps · ~15 min',
  'draft.next.title': 'You’re four steps from filing.',
  'draft.next.1t': 'Review your filled-in RA-89',
  'draft.next.1pre':
    'The “Download RA-89 (filled)” button above already filled the official form from your answers. Open that PDF and check every section against your own records — fix anything that’s off in your PDF viewer, or start over from a ',
  'draft.next.1link': 'blank RA-89 ↗',
  'draft.next.2t': 'Sign and date it',
  'draft.next.2b':
    'Sign the certification on the last page by hand — no notary needed; you’re certifying your attached documents are true copies. (We pre-filled today’s date and left the signature line blank for you.)',
  'draft.next.3t': 'Gather your evidence',
  'draft.next.3b':
    'Attach copies of every lease and renewal, plus rent receipts, cancelled checks, or money orders showing what you actually paid. Section 19 of the form is a checklist — tick what you’re including. Submit copies and keep your originals; your companion doc makes a handy plain-English cover sheet.',
  'draft.next.4t': 'File it — two ways',
  'draft.next.4onlineLabel': 'Online (fastest)',
  'draft.next.4onlineLink': 'DHCR Rent Connect ↗',
  'draft.next.4onlineNote': ' — upload your signed RA-89 and every supporting document in one go (you must include them all when you file).',
  'draft.next.4mailLabel': 'By mail',
  'draft.next.4mailNote': ' — send two copies, keep one for yourself:',
  'draft.next.tipLabel': 'Strongest evidence:',
  'draft.next.tipPre': ' before (or right after) filing, request your apartment’s certified rent history through ',
  'draft.next.tipLink': 'DHCR Records Access (REC-1)',
  'draft.next.tipPost': '. It’s the official record of your legal rent and makes an overcharge far harder to dispute. Expect a docket number by mail once your complaint is accepted; investigations can take a while.',

  'draft.editRaw': 'Edit the underlying text',
  'draft.editRawHint': 'Edits regenerate the PDF preview above as you type.',
  'draft.disclaimer':
    'Review every line before filing and consider speaking with a tenant attorney. This is not a law firm and use of this tool does not create an attorney-client relationship. Not affiliated with or endorsed by DHCR or any NY state agency.',
  'draft.notLegalAdvice': 'Not legal advice.',
  'draft.error.service': 'The drafting service failed. Please try again.',
  'draft.error.failed': 'Something went wrong drafting the complaint.',
  'draft.error.ra89': 'Failed to generate RA-89',

  'email.subject': 'RA-89 Filing Packet — {street}',
  'email.hi': 'Hi,',
  'email.attached': 'Attached is my draft RA-89 filing packet for {address}.',
  'email.bbl': 'BBL: {bbl}',
  'email.note':
    'The PDF was generated by amirentstabilized.nyc and is a starting point — please review every line before filing.',
  'email.aTenant': 'A tenant',

  // ── Footer ────────────────────────────────────────────────────────
  'footer.colophon': 'About this service',
  'footer.lede':
    '{title} is a free tenant lookup for the roughly one million rent-stabilized apartments in New York City.',
  'footer.body':
    'Surfaces public DHCR / NYCDB rent-stabilization data and computes an indicative overcharge using NYC Rent Guidelines Board increases. It does not model MCI/IAI adjustments, vacancy allowances, or any case-specific facts. Always verify directly with DHCR and consider speaking with a tenant attorney before filing. This is not a law firm and use of this tool does not create an attorney-client relationship. Not affiliated with or endorsed by DHCR or any NY state agency.',
  'footer.notLegalAdvice': 'Not legal advice.',
  'footer.site': 'Site',
  'footer.sources': 'Sources',

  // ── Info story chrome ─────────────────────────────────────────────
  'story.englishOnly': 'The full story below is currently available in English only.',
} as const;

export type MessageKey = keyof typeof en;
