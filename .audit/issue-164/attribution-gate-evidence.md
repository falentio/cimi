# Attribution gate evidence

Driven through the real composition root at branch head bd4ffab7, one throwaway
vitest file run with vp test run --dir /tmp. The seeded site reached 27,468 accepted
events with a ready projection. Every field below is measured, not asserted in a test.

ensure status | 200
site id | "ste_kea57vvyny5x65hpis2aawo35i"
accepted events | 27468
journal quiet at ms | 16069
seed wall ms to projection ready | 16572
ready() | true
accepted_event attribution columns | {"n":27468,"utm_source":27468,"utm_medium":27468,"utm_campaign":17138,"device_type":27468,"browser":27468,"os":27468,"country":27468}
analytics_sessions null counts | {"sessions":4757,"null_utm_source":0,"null_utm_medium":0,"null_device":0,"null_browser":0,"null_os":0,"null_country":0}
breakdown utm status | 200
breakdown utm rows | [["newsletter / email / product-update",619],["twitter / social",602],["google / cpc / retargeting",600],["newsletter / email",596],["google / organic",578],["linkedin / social / hiring",566],["github / referral / readme",564],["google / cpc / spring-sale",555]]
breakdown device status | 200
breakdown device rows | [["desktop",2344],["mobile",1866],["tablet",470]]
breakdown browser status | 200
breakdown browser rows | [["Chrome",2376],["Mobile Safari",950],["Firefox",467],["Safari",447],["Samsung Internet",440]]
breakdown os status | 200
breakdown os rows | [["iOS",1447],["Windows",925],["Mac OS",904],["Android",889],["Linux",515]]
breakdown country status | 200
breakdown country rows | [["BR",621],["IN",607],["CA",590],["FR",587],["JP",585],["US",576],["DE",564],["GB",550]]
utm rows carrying a campaign | 5
utm rows without a campaign | 3
