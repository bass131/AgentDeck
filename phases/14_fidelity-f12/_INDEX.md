# Milestone 14 — 충실도 F12: 모달 군 2 (ImageViewer·온보딩·게이트·로그인) (Fidelity)

> REPLICA_GAP 웨이브 F12. 원본 ImageViewer·WhatsNew·UpdateNotes·EngineGate·AppUpdateGate·Profile를 시각 1:1. **디자인-우선**: 정적 샘플. ImageViewer=라이브 트리거(컴포저 첨부 썸네일 클릭); 나머지 5개=**라이프사이클 화면**(첫설치/버전업/엔진설치/업데이트/로그인) → Shell open state, **라이브 트리거 없음(default off)**, 실 동작=M5, **단위 시각 검증**. renderer-only, 새 IPC 0.

## 원본 구조
- **ImageViewer**(129L): iv-overlay > iv-top(iv-name + iv-count N/M + iv-spacer + 기본앱으로 열기[no-op] + 닫기) + iv-stage(iv-nav prev IconChevLeft + iv-imgwrap>iv-img[클릭 줌] + iv-nav next) + iv-strip(iv-thumb 필름스트립). Esc/←→/백드롭 닫기. 단일=이미지만, 다중=chevron+strip.
- **WhatsNew**(278L): 6슬라이드 온보딩 데크 — wn-scrim(배경) + wn-hero(wn-eyebrow·wn-titlewrap[wn-title·wn-accent]·wn-desc·wn-logo) + wn-dock(wn-nav 칩 네비) + 건너뛰기/CTA. Esc/←→.
- **UpdateNotes**(222L): un-hero(un-eyebrow·un-name CharReveal·메탈 그라디언트) + un-marquee(un-marquee-track/group/item 키워드) + un-list(un-item 01/02 번호 + un-lead/un-desc) + un-cta "시작하기" + un-foot. Esc.
- **EngineGate**(172L)·**AppUpdateGate**(101L): install-card 관용구(set-dialog-overlay > install-card > ic-head[ic-hic 스피너/체크/경고 + ic-title + ic-ver] + ic-log[ic-ln] + ic-foot[ic-status + sd-cancel/sd-go]). phase별(available/downloading/downloaded/error or installing/done/error).
- **Profile**(190L): 풀윈도우(win + TitleBar) + login-body(lg-brand[mark+wordmark + head + feats 4] + lg-form-wrap>lg-form[title 다시 오셨네요/시작하기 + desc + pf-preview(pf-ava 색+이니셜) + 닉네임 field + pf-swatches 아바타 색 그리드(AVATAR_PALETTE) + 입장하기 submit]). avatarColor/swatch 인라인 동적색(F8 예외 동일).

## 적응 (우리)
- ImageViewer: 컴포저 img-thumb-open 클릭(F9 onOpenImage) → Shell open state(images+index). 기존 인라인 ImagePreview(중앙 pane)는 유지, 라이트박스는 별도 오버레이.
- WhatsNew/UpdateNotes/EngineGate/AppUpdateGate/Profile: 컴포넌트 + open prop. Shell open state(default off). 라이프사이클 실트리거=M5. `lib/whatsNewSampleData.ts`·`updateNotesSampleData.ts`(슬라이드/항목) + AVATAR_PALETTE(lib/avatarColor 신규). 기본앱열기/설치/업데이트/입장 = 시각(로컬). **새 IPC 0.**
- 아이콘: IconChevLeft(있으면)·기존 재사용.

## Phase 분해 (4)
| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | imageviewer-lightbox | renderer | 없음 | F11 |
| 02 | whatsnew-updatenotes | renderer | 없음 | 01 |
| 03 | gates-profile | renderer | 없음 | 02 |
| 04 | f12-visual | qa | 없음 | 03 |

## 실행/검증
renderer + TDD + reviewer + 시각검증(ImageViewer e2e 스샷; 라이프사이클 5개=단위 시각). 완료 시 REPLICA_GAP F12 ✅ + Iteration 로그.
