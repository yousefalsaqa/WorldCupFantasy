# FIFA fantasy cross-check report
Generated 2026-06-11T04:02:04.037Z — report only, nothing applied.

## Summary
- FIFA "playing": 1245 | our DB: 1253
- Matched: 1245 (100.0% of FIFA)
- FIFA players we don't have: 0
- Our players FIFA cut (transferred): 8
- Our players with no FIFA row at all: 0
- Position mismatches: 0
- Price FLAG (|diff| >= 1.5): 0
- Price LOG  (0.7 <= |diff| < 1.5): 6

## 🚩 FLAGGED — |diff| >= £1.5m (decide what to do)
Negative diff = we are CHEAP vs FIFA (likely Feb–Jun breakout). Positive = we are EXPENSIVE.

| Nat | Player | Pos | Ours | Expected | Diff | FIFA raw | FIFA picked |
|---|---|---|---|---|---|---|---|

## 📋 LOGGED — £0.7m <= |diff| < £1.5m

| Nat | Player | Pos | Ours | Expected | Diff | FIFA raw | FIFA picked |
|---|---|---|---|---|---|---|---|
| CRO | Mario Pašalić | MID | £6.0 | £7.0 | -1.0 | 6.4 | 0.1% |
| FRA | A. Rabiot | MID | £6.0 | £7.0 | -1.0 | 6.4 | 0.3% |
| MEX | Álvaro Fidalgo | MID | £6.0 | £7.0 | -1.0 | 6.4 | 0.3% |
| URU | M. Araújo | MID | £6.0 | £7.0 | -1.0 | 6.4 | 0.3% |
| GHA | A. Fatawu | FWD | £6.0 | £7.0 | -1.0 | 6.4 | 0.1% |
| SWE | Elanga | FWD | £7.0 | £6.0 | +1.0 | 5.8 | 0.4% |

## 🔄 Position mismatches (ours vs FIFA)

| Nat | Player | Ours | FIFA | Our price | Matched via |
|---|---|---|---|---|---|

## 👀 Soft matches (fuzzy / API-Football-assisted) — eyeball these

| Nat | Our player | FIFA name | Pos ours/FIFA | Via |
|---|---|---|---|---|
| EGY | Al Mahdi Soliman | El Mahdy Soliman | GK/GK | fuzzy(2) |
| IRQ | Rebin Solaka | Rebin Sulaka | DEF/DEF | fuzzy(1) |
| JOR | I. Sa'deh | Ibrahim Sadeh | MID/MID | fuzzy(0) |
| JOR | Abdallah Naseeb | Abdallah Nasib | DEF/DEF | fuzzy(2) |
| KOR | Park Jin-Seop | Park Jin-Seob | MID/MID | fuzzy(1) |
| QAT | Ahmed Fathi | Ahmed Fathy | MID/MID | fuzzy(1) |
| KSA | Ayman Yahya | Aiman Yahya | MID/MID | fuzzy(1) |
| KSA | Hassan Kadesh | Hassan Kadish | DEF/DEF | fuzzy(1) |
| KSA | Abdullah Al Hamdan | Abdullah Al Hamddan | FWD/FWD | fuzzy(1) |
| QAT | Sultan Al Braik | Sultan Al Brake | DEF/DEF | fuzzy(2) |
| JOR | Rajaei Ayed | Raja'ei Ayed | MID/MID | fuzzy(0) |
| IRQ | Mustafa Saadoun | Mustafa Saadoon | DEF/DEF | fuzzy(1) |
| BRA | Ederson | Ederson | GK/GK | api(100) |
| CPV | Borges | Diney | DEF/DEF | api(100) |
| KSA | Al-Dawsari | Nasser Al Dawsari | MID/MID | api(45) |
| MAR | M. Mohamedi | Munir El Kajoui | GK/GK | api(100) |
| QAT | Mohamed Al Manai | Mohammad Al Mannai | MID/MID | api(40) |
| TUN | S. Ben Hsan | Sabri Ben Hessen | GK/GK | api(22) |
| EGY | T. Alaa | Tarek Alaa | DEF/DEF | api(40) |
| EGY | H. Abdelkarim | Hamza Abdelkarim | FWD/FWD | api(40) |
| IRN | M. Ghaedi | Mehdi Ghayedi | MID/MID | api(40) |
| CPV | L. Duarte | Deroy Duarte | MID/MID | api(22) |
| CPV | Cabral | Sidny Cabral | DEF/DEF | api(100) |
| KSA | J. Thakri | Jehad Thikri | DEF/DEF | api(40) |
| IRQ | A. Qasem | Ahmed Qasem | MID/MID | api(45) |
| IRQ | Z. Ismaeel | Zaid Ismael | MID/MID | api(40) |
| IRQ | A. Jasim | Ali Jasim | FWD/FWD | api(40) |
| JOR | Yazid Abu Layla | Yazeed  Abulaila | GK/GK | api(40) |
| JOR | M. Abualnadi | Mohammad Abu Al Nadi | DEF/DEF | api(45) |
| JOR | Mohammed Abu Zurayq | Mohammad Abu Zraiq | FWD/FWD | api(40) |
| JOR | O. Al Fakhouri | Odeh Fakhoury | FWD/FWD | api(40) |
| UZB | A. Ulmasaliev | Avazbek O'lmasaliev | DEF/DEF | api(45) |
| UZB | A. Amonov | Azizbek Amanov | FWD/FWD | api(45) |
| UZB | A. Ganiyev | Aziz G'aniev | MID/MID | api(40) |
| UZB | O. Orunov | Oston Urunov | MID/MID | api(45) |
| UZB | S. Nasrullayev | Sherzod Nasrullaev | DEF/DEF | api(45) |
| UZB | A. Nematov | Abduvokhid Ne'matov | GK/GK | api(45) |
| ENG | N. Oreilly | Nico O'Reilly | DEF/DEF | api(100) |
| IRQ | A. Maknzi | Ahmed Maknzi | DEF/DEF | leftover-signal |
| IRQ | A. Y. Hashim | Ali Yousif | FWD/FWD | leftover-signal |
| IRQ | Meme | Mohanad Ali | FWD/FWD | leftover-1to1 |
| KSA | Nawaf Boushal | Nawaf Bu Washl | DEF/DEF | leftover-signal |
| KSA | Ala Al Haji | Alaa Al Hejji | MID/MID | leftover-signal |
| TUN | C. Abdelmouhib | Abdelmouhib Chamakh | GK/GK | leftover-signal |
| SEN | I. Ndiaye | Bara Sapoko Ndiaye | MID/MID | leftover-signal |

## 🚪 Our players FIFA marks "transferred" (cut from final squad)

| Nat | Player | Our price | isAvailable | Note |
|---|---|---|---|---|
| JOR | Sabra | £4.5 | false | Not in final World Cup squad |
| CAN | M. Flores | £6.0 | false | Not in final World Cup squad |
| BRA | Wesley | £4.5 | false | Not in final World Cup squad |
| NED | J. Timber | £5.0 | false | Not in final World Cup squad |
| IRQ | A. Yahya | £4.0 | false | Not in final World Cup squad |
| ARG | L. Balerdi | £4.5 | false | Not in final World Cup squad |
| AUT | Baumgartner | £6.5 | false | Not in final World Cup squad |
| GER | L. Karl | £6.0 | false | Not in final World Cup squad |

## ❓ FIFA "playing" players we could not match

| Nat | FIFA name | Pos | FIFA price |
|---|---|---|---|

## ❓ Our players with no FIFA row (playing or transferred)

| Nat | Player | Pos | Our price | apiFootballId |
|---|---|---|---|---|