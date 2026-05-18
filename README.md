# 童軍野外定向電子工具

一個 **Vite + React + TypeScript + Tailwind CSS** 製作的單頁 PWA 網頁應用，用於童軍野外定向活動。

系統設計目標：

- 全網頁，不需要後端
- 可安裝為 PWA，支援離線快取
- 分離賽員端、賽事中心、CP 管理員、系統設定
- 使用 QR Code 完成身份初始化、CP 打卡、終點結算
- 使用活動代碼、Salt、簽章作防作弊驗證
- 賽事中心可匯出 Excel 成績總表

---

## 角色與入口

| 角色 | 路徑 | 用途 |
|---|---|---|
| 賽員端 | `/` | 掃身份 QR、掃 CP QR、最後產生結算 QR |
| 賽事中心 | `/center` | 製作賽員 QR、接收結算 QR、統計成績、匯出 Excel |
| CP 管理員 | `/admin` | 製作及列印 CP QR Code |
| 系統設定 | `/super` | 更改活動代碼、賽事中心密碼、CP 管理員密碼 |

---

## 初次登入資料

系統不提供賽事中心或 CP 管理員預設密碼。

首次使用必須先進入 `/super` 完成設定：

- 活動代碼 / 特定密碼
- 賽事中心密碼
- CP 管理員密碼

系統設定需要超級管理員密碼。請向項目負責人索取。

> 注意：超級管理員密碼不會在畫面或文件中顯示。正式活動前請進入系統設定，更改賽事中心密碼、CP 管理員密碼及活動代碼。

---

## 正式活動前設定流程

1. 進入 `/super`
2. 輸入超級管理員密碼
3. 設定：
   - 活動代碼 / 特定密碼
   - 賽事中心密碼
   - CP 管理員密碼
4. 儲存設定
5. 輸入本次活動的「鎖網頁密碼」
6. 產生「活動設定包」
7. 將「活動設定包」和「鎖網頁密碼」分開交給活動負責人
8. 活動負責人在賽事中心/CP 管理員裝置貼上設定包並輸入鎖網頁密碼
9. 重新登入 `/center` 及 `/admin`
10. 用新的活動代碼產生本次活動的：
   - 賽員身份 QR
   - CP QR

活動代碼會參與 QR Code 簽章。不同活動代碼產生的 QR 不能互用。

### 為何需要鎖網頁密碼？

如果某工作人員在 A 活動知道後台密碼，但 B 活動變成賽員，他不應能繼續登入 B 活動後台。

因此 B 活動需要新的：

- 活動代碼
- 賽事中心密碼
- CP 管理員密碼
- 鎖網頁密碼

管理裝置必須先套用 B 活動設定包，並輸入正確鎖網頁密碼，才會啟用 B 活動後台。舊活動裝置或舊工作人員不會自動取得新設定。

---

## 比賽流程

### A. 賽前：製作賽員身份 QR

1. 進入 `/center`
2. 輸入賽事中心密碼
3. 在「派發賽員身份 QR」輸入：
   - 小隊 ID
   - 小隊名稱
   - 組別 / 分站
4. 按「生成」
5. 將 QR Code 派發給賽員

也可用 CSV 批次匯入：

```csv
T001,青松小隊,第一分站
T002,猛虎小隊,第一分站
T003,白鷹小隊,第二分站
```

欄位格式：

```text
id,name,group
```

---

### B. 賽前：製作 CP QR

1. 進入 `/admin`
2. 輸入 CP 管理員密碼
3. 輸入：
   - CP 編號
   - 分數
4. 按「生成」
5. 列印 QR Code，放置於 CP 燈籠

每個 CP QR 內含：

- CP 編號
- 分數
- 隨機 Salt
- 活動 Event ID
- 簽章 Signature

---

### C. 賽員比賽

1. 賽員進入 `/`
2. 起點掃描大會派發的身份 QR
3. 比賽中掃描 CP QR
4. 同一 CP 重複掃描不會重複計分
5. 到終點後按「最後結算」
6. 手機畫面產生結算 QR Code
7. 賽員端鎖定，不能再修改

---

### D. 終點收成績

1. 賽事中心進入 `/center`
2. 輸入出發時間、到達時間、備註
3. 掃描賽員手機的結算 QR
4. 系統驗證：
   - 身份簽章
   - CP Salt
   - CP 簽章
   - 活動 Event ID
   - 結算簽章
   - 重複 CP
   - 總分是否被改動
5. 通過後加入成績表
6. 全部完成後按「匯出 Excel」

---

## 離線使用說明

本系統使用 Service Worker 快取核心頁面：

- `/`
- `/center`
- `/admin`
- `/super`

建議活動前：

1. 用活動電腦或手機打開所有入口一次
2. 確認頁面已載入
3. 測試相機權限
4. 測試產生 QR、掃描 QR、匯出 Excel
5. 再進入無網絡環境使用

---

## 部署到 GitHub + Vercel

### 1. 安裝依賴

```bash
npm install
```

### 2. 本機開發

```bash
npm run dev
```

### 3. 建置測試

```bash
npm run build
```

### 4. 上傳 GitHub

```bash
git init
git add .
git commit -m "Initial scout orienteering PWA"
git branch -M main
git remote add origin <你的 GitHub Repo URL>
git push -u origin main
```

### 5. Vercel 部署

1. 登入 Vercel
2. Import Git Repository
3. 選擇 GitHub repo
4. Framework Preset 選 Vite
5. Build Command：

```bash
npm run build
```

6. Output Directory：

```text
dist
```

7. Deploy

本專案已包含 `vercel.json`，會把 `/center`、`/admin`、`/super` 等路徑導回 SPA，不會出現重新整理 404。

---

## 重要限制

這是一個純前端、無後端系統：

- 成績資料存在使用中的瀏覽器 LocalStorage
- 建議固定使用同一台賽事中心電腦登記成績
- 匯出 Excel 後請即時備份
- 若清除瀏覽器資料，未匯出的本機資料會消失

---

## 技術棧

- Vite
- React
- TypeScript
- Tailwind CSS
- html5-qrcode
- qrcode
- xlsx
- lucide-react

---

## 建議正式測試清單

- [ ] 更改活動代碼
- [ ] 更改賽事中心密碼
- [ ] 更改 CP 管理員密碼
- [ ] 產生賽員身份 QR
- [ ] 產生 CP QR
- [ ] 賽員端掃身份 QR
- [ ] 賽員端掃 CP QR
- [ ] 重複掃同一 CP，確認不加分
- [ ] 終點產生結算 QR
- [ ] 賽事中心掃結算 QR
- [ ] 匯出 Excel
- [ ] 離線模式測試
