# STAR PLUS demo script (3 minutes, minimum-version features only)

Setting: Mars transit, 20-minute one-way delay. All scenes work offline unless noted.

## 0:00 CUJ 1 — emergency in a blackout
- No login. Tap the emergency control from the home screen.
- Choose "someone else, not responding".
- Step through one cited instruction per screen with large targets.
- Each step is recorded with a time.
- A report with subject "unknown crewmate" is queued: "queued — will send when the link returns; earliest reply about 40 minutes after sending".

## 0:45 CUJ 2 — self-check
- Log in. Open today's reminder.
- Enter blood pressure and heart rate.
- See per-measure and overall status, reason with source, cited next steps, baseline chart.
- Record syncs and shows "delivered" when the link returns.

## 1:30 CUJ 4 — estimate entry
- Enter heart rate 128 bpm, marked "estimated, no device".
- Confirm with a device before escalating, or choose "no device available" to keep the amber result and tell the crew medical officer.

## 2:00 CUJ 7 — report delivered and acknowledged
- Flight surgeon (`flight_medical_officer`) view lists the queued report once with raw values, steps, status with source and versions.
- Surgeon marks it "acknowledged"; the device shows that on next sync.

## 2:30 CUJ 6 — model swap
- New `model.json` committed; checks pass; advisory panel uses the new `model_version`.
- On check failure the app keeps scoring with limits and baselines and says "model unavailable".

## 2:50 CUJ 8 — demo mode
- Judge opens the public URL, switches on demo mode.
- Banner and distinct palette mark everything synthetic; demo crew loads into the on-device store only; nothing is sent.
