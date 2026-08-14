# 商用 OCT 工作站深色视觉设计调研（cinematic dark medical 设计语言）

> Research ticket: transmit-bug/pacsviewer #120（只读调研，未修改任何应用代码）
> 调研范围：把产品做成"精装商用 OCT 工作站"的深色 UI 设计语言与医学影像呈现惯例。回答 5 个问题：布局、HUD/图内信息、深色配色与对比度、深色背景上的测量/标注、字体排印。
> 信源全部为**一手来源**：厂商官方产品页、官方 brochure/datasheet PDF、官方用户指引 PDF、DICOM/IHE/AAPM 官方标准与报告、厂商官网 UI 截图（并做像素采样验证）。未引用二手博客。
> 证据等级标注：`[官方声明]` = 厂商/标准原文；`[截图观察]` = 对厂商官网截图做像素采样得到的观察；`[推断建议]` = 基于上述证据推导的设计建议（供 grilling 讨论）。

---

## 0. 结论摘要（TL;DR）

深色 OCT 工作站的通用签名是：**纯黑或近黑图像视口 + 深灰/蓝灰 chrome 面板 + 高对比描边标注 + 规范化的状态色**。证据跨越 ZEISS（FORUM / CIRRUS / Retina Workplace）、Heidelberg（HEYEX 2 / SPECTRALIS）、Topcon（Maestro2 / Harmony）、Canon（Xephilio OCT-A1）四家厂商，以及 DICOM / IHE CPI / AAPM TG18 / TG270 标准。

| 问题 | 关键结论 |
|---|---|
| 布局 | 双窗格工作台（左数据管理/患者导航 + 右多模态视口），可折叠菜单栏 + 收藏工具栏，文档可堆叠/并排切换，集成 OCT 滚动条；报告型单屏布局配"切面导航器"（crosshair 联动） |
| HUD | 图内信息分两类：临床数据（患者/检查信息，常置于图像上缘）与图像状态（窗宽窗位、缩放、层号、比例尺）；DICOM GSPS 标准给出了完整模型（显示区域/缩放、VOI LUT、旋转翻转、图层化注释） |
| 配色 | 视口近黑（≈#000–#101010）、chrome 深灰（≈#303030–#606060）带冷调蓝灰（≈#303040）；现代阅读室建议 25–75 lux、环境光比 AR ≤ 1/4；状态色沿用"绿/黄/红/灰"规范编码 + 进展色"黄→红、橙→栗色" |
| 标注 | DICOM GSPS 为"深色背景上如何可读"提供了工程答案：文字阴影/描边（NORMAL/OUTLINED）、CIELab 颜色、图层顺序、实线/虚线双色；CIRRUS 用黑/红/品红/青/黄线区分不同分割层 |
| 字体 | 系统无衬线（SF Pro / Segoe UI Variable）+ CJK 回退（PingFang SC / Microsoft YaHei UI / Noto Sans SC）；测量数字列用 `tabular-nums` 对齐；避免斜体 |

---

## 1. 信源清单

### 1.1 厂商一手来源

| 厂商 | 来源 | URL |
|---|---|---|
| ZEISS | FORUM 产品页（FORUM 4.4，含功能声明） | https://www.zeiss.com/meditec/en/products/digital-solutions/forum.html |
| ZEISS | FORUM 4.4 落地页（EN） | https://www.zeiss.com/meditec/en/c/opt/zeiss-forum-ophthalmology-software.html |
| ZEISS | FORUM 4.4 Datasheet PDF（分辨率要求等） | https://asset-downloads.zeiss.com/catalogs/download/med2/637f12de-1bbb-439a-83f1-4919510a79bd/FORUM_4.4_Datasheet_EN.pdf |
| ZEISS | CIRRUS 6000 产品页（含 Review Station / FORUM 集成） | https://www.zeiss.com/meditec/en/products/optical-coherence-tomography-devices/cirrus-6000-performance-oct.html |
| ZEISS | **CIRRUS "How to Read the Reports" Guide（报告布局/颜色/分割线颜色的官方解读）** | https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf |
| ZEISS | Retina Workplace 界面截图（官网图库） | https://www.zeiss.com/meditec/en/products/optical-coherence-tomography-devices/cirrus-6000-performance-oct.html（图：retina-workplace/images/picture1_new.jpg） |
| Heidelberg | HEYEX（Heidelberg Eye Explorer）产品页 | https://www.heidelbergengineering.com/en/products/heidelberg-eye-explorer |
| Heidelberg | **HEYEX 2 Brochure PDF（布局/MMV/双屏模式官方描述）** | https://www.heidelbergengineering.com/globalassets/media/marketing/brochures/200277-003_heyex2_brochure_heyex2brochure_en_download.pdf |
| Heidelberg | SPECTRALIS 产品页 | https://www.heidelbergengineering.com/en/products/spectralis |
| Heidelberg | HEYEX UI 截图（cscr.jpg / multi-modality-viewer.jpg，官网图库） | https://www.heidelbergengineering.com/en/products/heidelberg-eye-explorer（图：clinical-images/heyex-2/cscr.jpg 等） |
| Topcon | Maestro2 产品页 | https://topconhealthcare.com/products/maestro2/ |
| Topcon | **Maestro2 US Brochure PDF（报告类型/测量工具）** | https://cdn.brandfolder.io/I6S47VV/at/qc6ni7-2x06f4-1nvcqt/Maestro2_US_Brochure.pdf |
| Topcon | Harmony（临床数据管理平台）产品页 | https://topconhealthcare.com/products/harmony/ |
| Topcon | DICOM OCT Export Tool 新闻稿（OCTA 数据标准化） | https://topconhealthcare.com/article/topcon-healthcare-expands-access-to-standardized-dicom-oct-imaging-data/ |
| Canon | Xephilio OCT-A1 产品页 | https://us.medical.canon/products/eye-care/xephilio-oct-a1/ |
| Canon | Xephilio OCT-A1 Sales Sheet PDF（RX Capture 软件/显示规格） | https://us.medical.canon/download/ec-ss-oct-a1 |

### 1.2 标准与工程一手来源

| 标准 | 内容 | URL |
|---|---|---|
| DICOM PS3.3 A.33.1 | Grayscale Softcopy Presentation State IOD（GSPS）模块表与能力描述 | https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.33.html |
| DICOM PS3.3 C.10.5 | Graphic Annotation Module（注释颜色/线型/阴影/字体属性） | https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.5.html |
| DICOM PS3.3 C.10.4 | Displayed Area Module（显示区域/缩放/平移模型） | https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.4.html |
| DICOM PS3.14 | Grayscale Standard Display Function（GSDF/JND/P-Value 定义） | https://dicom.nema.org/medical/dicom/current/output/chtml/part14/chapter_3.html |
| IHE CPI | Consistent Presentation of Images profile | https://wiki.ihe.net/index.php/Consistent_Presentation_of_Images |
| AAPM TG18 (OR_03) | 医学显示评估（环境光照 lux、眩光、GSDF 校准） | https://www.aapm.org/pubs/reports/OR_03.pdf |
| AAPM TG270 (RPT_270) | 显示 QA（阅读室 25–75 lux、环境光比 AR≤1/4） | https://www.aapm.org/pubs/reports/RPT_270.pdf |
| Apple | Fonts for Apple platforms（SF Pro / SF Mono / 脚本扩展） | https://developer.apple.com/fonts/ |
| Microsoft | Typography in Windows（Segoe UI Variable / 中文字体 / type ramp） | https://learn.microsoft.com/en-us/windows/apps/design/style/typography |
| Noto | Noto CJK fonts 官方仓库 | https://github.com/notofonts/noto-cjk |
| MDN | `font-variant-numeric`（tabular-nums） | https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric |

### 1.3 截图观察方法

对厂商官网发布的 UI 截图（HEYEX `cscr.jpg` 1920×1200、`multi_modality_viewer.jpg` 1919×1200；ZEISS CIRRUS 6000 gallery 图、Retina Workplace 界面图）做像素采样：每 3px 采样一次，RGB 量化到 16 步桶，统计全图/深色像素分布与饱和色相带。只用于佐证 chrome 明度层级与冷暖调，不用于精确取色。

---

## 2. 深色 OCT/PACS 工作站的布局惯例（Q1）

### 2.1 双窗格工作台：数据管理 + 多模态视口（HEYEX 2）

HEYEX 2 brochure 官方原话：*"Dual screen mode with the Data Manager (left) and the Multimodality Viewer (right) for the most efficient use of the system"*——左屏/左窗格为 Data Manager（患者/检查数据管理），右屏为 Multimodality Viewer（多模态阅片）[HEYEX 2 Brochure PDF, p.3](https://www.heidelbergengineering.com/globalassets/media/marketing/brochures/200277-003_heyex2_brochure_heyex2brochure_en_download.pdf)。

- 产品页补充：Multimodality Viewer"Drag and drop images into customizable layouts, use dual-monitor support, and add annotations or edits with ease. Co-localization tools and synchronized review options"——可拖拽到预置布局或自定义阅片协议、双显示器支持、同步阅片 [HEYEX 产品页](https://www.heidelbergengineering.com/en/products/heidelberg-eye-explorer)。
- 导航面板：HEYEX 2 的 navigator"gives a 3D view of the patient with procedures, thumbnail images, and reports all in one view"——患者 3D 视图 + 检查/缩略图/报告一体化导航 [HEYEX 2 Brochure PDF, p.6-7](https://www.heidelbergengineering.com/globalassets/media/marketing/brochures/200277-003_heyex2_brochure_heyex2brochure_en_download.pdf)。
- 双眼同屏：Multimodality Viewer"Simultaneously review images from both eyes, from any of the available modalities, and e.g. play multiple FA/ICGA videos at the same time"（双眼并排、多视频同步播放）[HEYEX 2 Brochure PDF, p.8](https://www.heidelbergengineering.com/globalassets/media/marketing/brochures/200277-003_heyex2_brochure_heyex2brochure_en_download.pdf)。

### 2.2 文档级并排/堆叠 + 集成 OCT 滚动（ZEISS FORUM）

FORUM 4.4 官方功能声明：*"Smoothly switch between reviewing documents in a stacked or side-by-side view and intuitively navigate through the documents"*——文档可堆叠（stacked）或并排（side-by-side）两种模式切换 [FORUM 产品页](https://www.zeiss.com/meditec/en/products/digital-solutions/forum.html)。

- 多文档同步操作：*"Perform actions such as zoom and pan, or color channel separation, on multiple documents simultaneously for quick comparison"*（多文档同时缩放/平移做对比）[FORUM 产品页](https://www.zeiss.com/meditec/en/products/digital-solutions/forum.html)。
- 集成 OCT 阅读器：*"Simultaneously scroll through the most recent OCT scans in the integrated OCT Display"*（集成 OCT Display 内同步滚动最近 OCT 扫描）[FORUM 产品页](https://www.zeiss.com/meditec/en/products/digital-solutions/forum.html)。
- 临床工作台扩展：FORUM 以 Glaucoma/Retina/Cataract/Refractive Workplace 插件提供专科布局 [FORUM 产品页](https://www.zeiss.com/meditec/en/products/digital-solutions/forum.html)。

### 2.3 报告型单屏布局 + 切面导航器（ZEISS CIRRUS）

CIRRUS 报告指南描述了典型单屏阅片布局：LSO/眼底图 + OCT 断层图 + 厚度图/偏差图 + 参数表 + 彩色图例同屏排列；并用 **slice navigator** 联动——*"Slice navigator enables a simultaneous view of a selected point on LSO image, OCT fundus image, retinal thickness map, layer maps, and OCT image displays"* [CIRRUS How to Read Reports Guide, p.7](https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf)。

- 交叉线取景框联动：*"Framed in blue, this image corresponds to the horizontal crosshair line of the fundus image above. Framed in pink, this image corresponds to the vertical crosshair line"*——用**蓝/粉取景框**标注哪张 B-scan 对应眼底图上的哪条 crosshair [CIRRUS Guide, p.7](https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf)。
- 软件栈定位：CIRRUS 数据经 DICOM（JPEG2000/JPEG Baseline）与 ZEISS FORUM、EMR 共享；*"CIRRUS Review Station"* 是独立阅片软件，支持 Windows 10/11/Server [CIRRUS 6000 产品页](https://www.zeiss.com/meditec/en/products/optical-coherence-tomography-devices/cirrus-6000-performance-oct.html)。

### 2.4 Topcon：one-touch, one-screen + 预设报告

- Maestro2 页面把设备 + Harmony 数据管理定义为*"a one-touch, one-screen diagnostic solution"*（单触、单屏）[Maestro2 产品页](https://topconhealthcare.com/products/maestro2/)；Harmony 定位为"vendor-inclusive, scalable, and secure cloud-based"临床影像/数据平台 [Harmony 产品页](https://topconhealthcare.com/products/harmony/)。
- 报告模板即布局：Maestro2 提供预设报告（3D Macula Report OU、Comparison Report-Change Analysis、3D Wide Glaucoma Report OU、3D Disc Report OU、HOOD Report、3D Disc Trend Analysis OU），均为"双眼并排 + 彩色厚度叠加 + ETDRS/参考数据库表 + 变化图"的组合 [Maestro2 US Brochure PDF](https://cdn.brandfolder.io/I6S47VV/at/qc6ni7-2x06f4-1nvcqt/Maestro2_US_Brochure.pdf)。

### 2.5 工具栏密度与面板 chrome

- HEYEX 2 官方：*"you can increase your view by collapsing the menu bars and create a favorites toolbox accessible at the touch of a button"*——**可折叠菜单栏 + 收藏工具栏**，即"图标式工具栏可收纳、主视图优先"的模式 [HEYEX 2 Brochure PDF, p.6-7](https://www.heidelbergengineering.com/globalassets/media/marketing/brochures/200277-003_heyex2_brochure_heyex2brochure_en_download.pdf)。
- FORUM 强调"minimal clicks"（最少点击）与 intuitive interface [FORUM 4.4 Datasheet PDF](https://asset-downloads.zeiss.com/catalogs/download/med2/637f12de-1bbb-439a-83f1-4919510a79bd/FORUM_4.4_Datasheet_EN.pdf)。
- `[截图观察]` HEYEX 真实截图（Greenshot 1920×1200）：面板 chrome 为深灰（采样峰值 ≈ #303030–#606060），带少量蓝灰面板（≈ #303040），视口纯黑；暖橙/红像素主要来自 OCT/眼底图像内容而非 UI 主色。CIRRUS 6000 官方 gallery 图为纯中性灰层级（#101010→#909090），几乎无彩色 chrome。
- `[推断建议]` 工具栏采用"图标式垂直/顶部条 + 分组弹层（popover）"，以可折叠 + 收藏快捷方式控制密度；面板以 1px 的深灰描边 + 低对比分区色分隔，不做粗边框。

### 2.6 分辨率基线（厂商声明）

- FORUM 4.4 Viewer：最低 1280×800，推荐 1920×1080 或更高 [FORUM 4.4 Datasheet PDF](https://asset-downloads.zeiss.com/catalogs/download/med2/637f12de-1bbb-439a-83f1-4919510a79bd/FORUM_4.4_Datasheet_EN.pdf)。
- Canon Xephilio OCT-A1：显示器 21.5" 或更大、1920×1080、Windows 10 Pro [Xephilio OCT-A1 Sales Sheet PDF](https://us.medical.canon/download/ec-ss-oct-a1)。
- `[推断建议]` 以 1080p 为最低设计基线，信息密度按 1920×1080 校准。

---

## 3. 图内 HUD / 信息叠加惯例（Q2）

### 3.1 厂商惯例（CIRRUS 官方指南）

CIRRUS "How to Read Reports" 是描述图内信息叠加的一手文档：

- **扫描参数叠加在图像上方**：*"Scan angle and length are adjustable. Parameters for the scan are indicated above the image. Location of the scan line is shown on the LSO fundus image."*（HD 1 Line 100× 与 HD Cornea 均如此）[CIRRUS Guide, p.9/p.23](https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf)。
- **B-scan 上叠加分割线与取景框**：RPE 层与视盘边界黑色、ILM 与杯边界红色；en face 上的 B-scan 位置线为青色；slab 分割为品红；Sub-RPE illumination 区域黄色描边 [CIRRUS Guide, p.5/p.11/p.6](https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf)。
- **图例随图显示**：色带图例（如 ETDRS "Distribution of Normals" 颜色编码表、偏差图例）内嵌于报告页 [CIRRUS Guide, p.7/p.13](https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf)。

### 3.2 DICOM GSPS：HUD 的标准数据模型

DICOM GSPS IOD 官方能力描述：*"It includes capabilities for specifying: (1) the output grayscale space in P-Values; (2) grayscale contrast transformations including modality and VOI LUT; (3) mask subtraction for Multi-frame Images; (4) selection of the area of the image to display and whether to rotate or flip it; (5) image and display relative annotations, including graphics, text and overlays"* [DICOM PS3.3 A.33.1.1](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.33.html)。

- **窗宽/窗位**：由 Softcopy VOI LUT Module（C.11.8）承载，即"窗宽/窗位"是呈现状态的一部分，跨系统保持一致 [DICOM PS3.3 A.33.1-1](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.33.html)。
- **缩放/平移**：Displayed Area Module（C.10.4）用 TLHC/BRHC 定义"scale to fit 模式下的缩放/平移"，并注明"The image may need to be cropped and scroll bars or a panning mechanism provided" [DICOM PS3.3 C.10.4](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.4.html)。
- **注释图层**：Graphic Annotation Module（C.10.5）支持"image-relative"（随图缩放）与"display-relative"（固定于视口）两种单位，且每条注释属于一个 Graphic Layer（C.10.7，图层顺序 + 推荐显示色）[DICOM PS3.3 C.10.5/C.10.7](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.5.html)。
- **一致性**：IHE CPI profile *"maintains the consistency of presentation for grayscale images and their presentation state information (including user annotations, shutters, flip/rotate, display area, and zoom)"*，并以 GSDF 为统一对比曲线 [IHE CPI](https://wiki.ihe.net/index.php/Consistent_Presentation_of_Images)。

### 3.3 HUD 可读性机制（工程答案）

GSPS 注释模块原生支持让文字在任意明暗图像上可读的属性 [DICOM PS3.3 C.10.5](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.5.html)：

- **文字阴影**：`Shadow Style` 枚举 NORMAL（单侧）/ OUTLINED（轮廓描边）/ OFF，并可设阴影颜色与不透明度——**这就是"亮图/暗图上文字都清晰"的标准做法（描边/投影）**。
- **文字颜色**：`Text Color CIELab Value` 以 CIELab 编码；图层级 `Recommended Display CIELab Value` 可作默认。
- **线型**：`Line Dashing Style` SOLID/DASHED，虚线支持 on/off 双色 + 不透明度；`Line Thickness`；`Graphic Filled` Y/N。
- **对齐**：Horizontal/Vertical Alignment（LEFT/CENTER/RIGHT、TOP/CENTER/BOTTOM）用于文本框定位。

`[推断建议]` HUD 分层：①临床数据（患者、检查日期、眼别）→ 图像上缘左侧、display-relative、半透明底板或描边字；②图像状态（窗宽/窗位、缩放比、层号/总数、比例尺）→ 图像下缘或角落，display-relative；③交互提示（工具名、测量值）→ 光标附近随动。全部用 1px 深色描边 + 微投影保证在亮眼底图（彩照）与暗 OCT 上都可读。

### 3.4 比例尺与量化标注

- OCT 厂商普遍把定量信息直接印在图上：CIRRUS 在图上标 μm 数值（如 pachymetry 图例"red at 750 mm and blue at 350 mm"为固定色标）[CIRRUS Guide, p.23](https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf)；Maestro2 变更图用"± microns"表示差异 [Maestro2 US Brochure PDF](https://cdn.brandfolder.io/I6S47VV/at/qc6ni7-2x06f4-1nvcqt/Maestro2_US_Brochure.pdf)。
- `[推断建议]` 保留：比例尺（µm/mm）、窗宽/窗位、缩放%、图像序号"3/128"、信号强度（SS，OCT 惯例）。这些在截图与报告指南中均有对应物。

---

## 4. 深色医疗 UI 配色与对比度（Q3）

### 4.1 截图观察（两家厂商、五张图）

| 截图（厂商官网） | 采样结果 |
|---|---|
| HEYEX `cscr.jpg`（1920×1200） | 纯黑视口主导；chrome 深灰 ≈ #303030–#606060；蓝灰面板 ≈ #303040；饱和像素中暖色（橙/红）占绝大多数但主要来自 OCT/眼底图像内容 |
| HEYEX `multi_modality_viewer.jpg` | 同上；额外出现橙棕（≈ #A04020）操作/激活元素 |
| ZEISS CIRRUS 6000 gallery-01/02 | 中性灰层级（#101010→#909090），几乎零彩色 chrome——ZEISS CIRRUS 用"纯净灰"做界面 |
| ZEISS Retina Workplace 界面图 | 大面积蓝灰面板 ≈ #303040、近黑 #101010、暖琥珀/橙色为厚度图色 |

两个独立厂商在 UI chrome 上都出现**蓝灰（≈#303040）面板 + 近黑视口**；暖色保留给图像内容与状态语义，不污染 chrome。

### 4.2 标准依据：低眩光阅读环境

- **GSDF（DICOM PS3.14）**：定义感知线性灰阶（JND 索引 → P-Value → 亮度），并明确"Ambient Light reduces the contrast in the image"（环境光降低图像对比度）[DICOM PS3.14 Ch.3](https://dicom.nema.org/medical/dicom/current/output/chtml/part14/chapter_3.html)。
- **AAPM TG18**：无镀膜玻璃屏"should only be used in very dark rooms (2 to 5 lux)"；多层 AR 镀膜显示器（亮度 2–500 cd/m²）可在约 25 lux 的房间使用；主显示设备应校准到 DICOM GSDF [AAPM TG18 (OR_03), §2.4.13/§2.4.3](https://www.aapm.org/pubs/reports/OR_03.pdf)。
- **AAPM TG270（现代建议）**：阅读室环境光建议 **25–75 lux**（并注明"传统'越暗越好'并非理想，现代平板显示器不需要"）；环境光比 **AR = L_amb / L_min ≤ 1/4**；避免高镜面反射的光面板、用间接照明；操作者白大褂反光会影响屏幕（*"white coats or shirts reflect ambient light toward the display, and strong colors may affect white point"*）[AAPM TG270 (RPT_270), §2.3.1/§4.1](https://www.aapm.org/pubs/reports/RPT_270.pdf)。

`[推断建议]` 深色 UI 是对"低环境光照（25–75 lux）+ GSDF 校准显示"的工程适配：chrome 亮度应远低于图像白点，避免在 25 lux 房间产生眩光/反射；面板明度层级用"背景 8–12%、浮层 12–18%、强调 20%+"的微小台阶，而不是亮灰大反差。

### 4.3 状态色与重点色（厂商规范）

CIRRUS 官方报告指南给出**规范化的状态色编码**（"Distribution of Normals"图例）[CIRRUS Guide, p.7/p.13](https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf)：

| 状态 | 颜色 | CIRRUS 语义 |
|---|---|---|
| 正常 | 绿（90%，5%≤x≤95%） | 在参考限内 |
| 临界 | 黄（1%≤x<5% 或 95%<x≤99%） | 疑低于/高于参考 |
| 异常 | 红（<1% 或 >99%） | 超出参考限 |
| 无参考 | 灰/白 | 参考数据库不适用（如 disc area 超出范围、年龄<18） |

进展（GPA）色另有约定：*"Areas of possible decrease are color coded yellow when first noted, then red when the change is sustained"*；RNFL/GC 进展色为 **orange（首次）→ maroon（持续）** [CIRRUS Guide, p.14/p.16](https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf)。

- 品牌色参考：Heidelberg 品牌红（banner 图为红/深红底）；Topcon 报告含 red-free（无红光）与 True Color 眼底图。
- `[推断建议]` 重点色（accent）用**青/teal 或暖琥珀/amber 二选一**，避免与状态色（绿/黄/红）混淆：可用青色系做"激活/选中/交互"（对应 DICOM 里 cyan 位置线、蓝色取景框的传统），琥珀做"警示/进展初发"，红/栗色仅保留给"异常/持续恶化"语义。品牌色单独放顶部栏/logo，不进入数据区。

### 4.4 推荐调色板（供 grilling）

`[推断建议]`（来源：截图观察 + 上述标准；具体色值为建议值，非厂商声明）：

| 层级 | 色值建议 | 依据 |
|---|---|---|
| 视口底 | `#000000`–`#0E0E12` | HEYEX/CIRRUS 截图视口为纯黑/近黑；GSDF 低环境光 |
| 背景 | `#14161A`（≈ 8% 亮度） | 低眩光、低于图像白点 |
| 面板（嵌套 1） | `#1B1E24` | 蓝灰冷调（观察 #303040 的收敛） |
| 面板（嵌套 2/弹层） | `#23272E` | 比面板 1 提一级 |
| 分隔线 | `rgba(255,255,255,0.06–0.09)` 或 `#2A2E35` | 1px、低对比（HEYEX 面板为细分隔） |
| 主文字 | `#E6E9EC`（≥ 4.5:1 于面板） | 数据密度阅读 |
| 次要文字 | `#9AA3AD` | 标签/说明 |
| 强调（交互） | 青 `#37C2C0` / `#3FD0C9` | 避免与状态色撞 |
| 状态 | 绿 `#3ECF8E` / 黄 `#F2C94C` / 红 `#EB5757` / 灰 `#6E7680` | 对齐 CIRRUS 绿/黄/红/灰语义 |
| 进展 | 橙 `#F2994A` / 栗 `#B2544E` | 对齐 GPA orange→maroon |
| 品牌 | 厂商自有色，仅顶部/logo | Heidelberg 红、Topcon 红 |

对比度底线：正文/数据 ≥ 4.5:1（WCAG AA 量级）；HUD 文字用描边 + ≥ 3:1 局部对比（因为叠加在图像上，无法用统一背景比）。

---

## 5. 深色背景上的测量/标注视觉惯例（Q4）

### 5.1 DICOM GSPS：标注渲染的完整属性集

Graphic Annotation Module 是所有 DICOM 阅片端标注渲染的规范基础 [DICOM PS3.3 C.10.5](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.5.html)：

- **颜色**：每条标注/每组图形可有独立 CIELab 颜色；图形对象用 `Pattern On Color`（前景）与 `Pattern Off Color`（背景）双色编码——**虚线可用"前景色+背景色"双色保证任何底色下可辨**。
- **可读性**：文字支持 `Shadow Style`（NORMAL/OUTLINED/OFF）+ 阴影颜色/不透明度；线支持 `Line Thickness`、SOLID/DASHED。
- **图形基元**：POINT / POLYLINE / INTERPOLATED / CIRCLE / ELLIPSE，闭合图形可填充（`Graphic Filled`）。
- **图层**：`Graphic Layer`（C.10.7）定义图层顺序与每层推荐显示色——标注分层渲染，互不遮挡、可整体显隐。
- **坐标系**：注释可选择随图像（image-relative，缩放跟随）或随视口（display-relative）[DICOM PS3.3 C.10.5](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.5.html)。

### 5.2 厂商的"黑底上标注"实际用色（CIRRUS）

CIRRUS 在黑色 OCT 断层图上用高对比 + 语义化颜色区分分割层 [CIRRUS Guide, p.11/p.5](https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf)：

| 结构 | 颜色 |
|---|---|
| RPE 层 / 视盘边界 | 黑（描在亮信号上） |
| ILM / 杯边界 | 红 |
| slab 分割（en face 上 B-scan 位置） | 品红 |
| en face 上 B-scan 位置线 | 青 |
| Sub-RPE illumination 区域 | 黄描边 |
| 神经视网膜边缘厚度曲线 | 蓝 |
| crosshair 对应 B-scan 取景框 | 蓝 / 粉 |

规律：**分割/测量线用 100% 饱和的高对比色（红、品红、青、黄、蓝），需要压亮部时用黑色**；交叉引用用彩色取景框。

### 5.3 测量工具与数据叠加（Topcon / Maestro2）

Maestro2 官方：前节 OCT 有 *"manual caliper tools"*（手动卡尺测量角膜厚度、巩膜接触镜间隙）；报告用 ETDRS 网格 + 参考数据库表 + "± microns"变更图 [Maestro2 US Brochure PDF](https://cdn.brandfolder.io/I6S47VV/at/qc6ni7-2x06f4-1nvcqt/Maestro2_US_Brochure.pdf)。

### 5.4 深色背景标注建议（供 grilling）

`[推断建议]`
1. 线色用 100% 饱和高对比色组（青/品红/黄/绿/橙），**避免用"中灰、低饱和"色**——黑底上会消失；需要"压在亮信号上"的线（如 RPE）允许用黑 + 1px 白描边。
2. 测量文本/数值用**深色描边 + 白字**（GSPS OUTLINED 模式），或半透明黑底板，保证彩照/暗图上都可读。
3. 手柄（handle）用**高亮色 + 外圈对比描边**（如青点 + 白边），激活/悬停放大。
4. 多套标注按层组织（对应 GSPS Graphic Layer），层序固定：分割层 < 测量层 < 文字层 < 交互光标层。
5. 测量值随图缩放的字号不变（display-relative 文本），只改变锚点位置（image-relative 锚点）。

---

## 6. 字体排印（Q5）

### 6.1 字体栈：系统无衬线 + CJK 回退

- Apple：SF Pro 是平台系统字体，"features nine weights, variable optical sizes... supports over 150 languages across Latin, Greek, and Cyrillic scripts"；另有**脚本扩展字体（含 CJK）**"designed to fit with SF Pro for multilingual typesetting"——即"拉丁主字体 + 同族 CJK 扩展"是官方推荐的多语言排版方式 [Apple Fonts](https://developer.apple.com/fonts/)。macOS 中文系统字体为 PingFang SC（系统内建）。
- Microsoft：Windows 系统字体为 **Segoe UI Variable**（可变字体，weight 100–700 + optical size 8–36pt）；简体中文 UI 字体为 **Microsoft YaHei UI**，繁体为 Microsoft JhengHei UI [Microsoft Typography](https://learn.microsoft.com/en-us/windows/apps/design/style/typography)。
- 跨平台开源：Noto CJK 家族分 SC/TC/HK/JP/KR 子集（Google Fonts 上即 Noto Sans SC 等）[Noto CJK 官方仓库](https://github.com/notofonts/noto-cjk)。
- `[推断建议]` 字体栈：`system-ui` 优先（SF Pro / Segoe UI Variable 自动命中），CJK 回退 `PingFang SC, Microsoft YaHei UI, Noto Sans SC`；数值与单位（µm、mm²）可与汉字同一字体族，但要开 `font-variant-numeric`。

### 6.2 数据密度与数字对齐

- **tabular-nums**：MDN 官方语义——*"activating the set of figures where numbers are all of the same size, allowing them to be easily aligned like in tables"* [MDN font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)。测量表（RNFL 象限、clock hour、ETDRS 分区、μm 数值）必须等宽数字对齐。
- **等宽字体**：Apple 官方描述 SF Mono——*"enables alignment between rows and columns of text"* [Apple Fonts](https://developer.apple.com/fonts/)。`[推断建议]` 图内 HUD 数值/窗宽窗位可用等宽（`ui-monospace` 栈：SF Mono / Roboto Mono / Consolas）保证同宽与稳定渲染。
- **字号阶梯**：Windows type ramp：caption 12/16、body 14/20、body-large 18/24、subtitle 20/28、title 28/36、display 68/92（单位 epx）[Microsoft Typography](https://learn.microsoft.com/en-us/windows/apps/design/style/typography)。
- **避免斜体**：Microsoft 官方注明 Italic 因可读性/可及性被排除出 type ramp（"Italic is excluded because it can reduce readability and legibility, particularly for people with dyslexia"）[Microsoft Typography](https://learn.microsoft.com/en-us/windows/apps/design/style/typography)。
- **字体命名的互操作**：DICOM GSPS 文字样式用 Font Name（ISO/IEC 14496-22 的 CSS 字体名）+ `CSS Font Name` 回退字段 [DICOM PS3.3 C.10.5](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.5.html)——Web 端直接用 CSS font-family 即可对齐。

`[推断建议]` 医学数据表体例：12–13px 正文、数字列 `font-variant-numeric: tabular-nums`、表头 11px 大写/半透明、行高 16–20px、µ/µm 等符号用同一字体族内建字形（避免 emoji 化渲染）。

### 6.3 中英混排注意点

`[推断建议]` 中文 + 数字 + 英文单位混排：中文用 CJK 回退字体（PingFang/YaHei/Noto Sans SC），西文与数字由拉丁字体接管（SF Pro/Segoe 自带度量）；单位符号（µm、mm²、°)保持与数字同字体；竖排/旋转文字在医学 HUD 中避免（可读性差）；数据表内"参数名（中文）+ 数值 + 单位"三列布局，数值统一右对齐。

---

## 7. 给设计评审的可执行清单（grilling-ready）

1. **布局骨架**：左"数据管理/患者导航"窗格（HEYEX Data Manager 模式）+ 右"多模态视口"，双屏可扩展；视口支持拖拽进预置/自定义布局，双眼并排为 OCT 刚需（Maestro2/CIRRUS 报告均 OU 并排）。
2. **工具栏**：图标式、可折叠、可收藏（HEYEX 官方模式）；工具用分组弹层而非全量平铺；交互态用青色系强调。
3. **面板 chrome**：1px 低对比分隔线 + 嵌套明度台阶（背景 #14161A → 面板 #1B1E24 → 弹层 #23272E），不做高亮粗边框；视口纯黑。
4. **HUD 分层**：上缘=临床数据（描边/半透明底），下缘/角落=窗宽窗位、缩放、层号、比例尺、信号强度；所有 HUD 文字 1px 描边 + 微投影（GSPS OUTLINED/NORMAL 语义）。
5. **状态色**：绿/黄/红/灰严格对齐 CIRRUS 语义（正常/临界/异常/无参考）；进展用橙→栗；品牌色只放顶部栏。
6. **标注**：高饱和对比色线（青/品红/黄/红/蓝）+ 黑色仅用于压在亮信号上的结构；手柄白边对比；测量文本白字黑描边；标注按层组织、层序固定。
7. **环境光**：文档注明阅读环境按 AAPM TG270 的 25–75 lux 与 AR ≤ 1/4 设计（chrome 亮度上限 ≈ 图像白点的 15–20%），避免镜面面板。
8. **字体**：`system-ui` + `PingFang SC/Microsoft YaHei UI/Noto Sans SC` 回退；测量列 `tabular-nums`；HUD 数值 `ui-monospace`；不用斜体；正文 13–14px、表头 11px。

---

## 8. 引用列表

厂商：
1. ZEISS FORUM 产品页 — https://www.zeiss.com/meditec/en/products/digital-solutions/forum.html
2. ZEISS FORUM 4.4 落地页 — https://www.zeiss.com/meditec/en/c/opt/zeiss-forum-ophthalmology-software.html
3. ZEISS FORUM 4.4 Datasheet PDF — https://asset-downloads.zeiss.com/catalogs/download/med2/637f12de-1bbb-439a-83f1-4919510a79bd/FORUM_4.4_Datasheet_EN.pdf
4. ZEISS CIRRUS 6000 产品页 — https://www.zeiss.com/meditec/en/products/optical-coherence-tomography-devices/cirrus-6000-performance-oct.html
5. ZEISS CIRRUS How to Read Reports Guide PDF — https://asset-downloads.zeiss.com/catalogs/download/med2/d7907388-e635-4b50-891a-6ef6d5a5bccb/CIRRUS_How_to_Read_Reports_Guide_EN.pdf
6. Heidelberg Eye Explorer 产品页 — https://www.heidelbergengineering.com/en/products/heidelberg-eye-explorer
7. HEYEX 2 Brochure PDF — https://www.heidelbergengineering.com/globalassets/media/marketing/brochures/200277-003_heyex2_brochure_heyex2brochure_en_download.pdf
8. Heidelberg SPECTRALIS 产品页 — https://www.heidelbergengineering.com/en/products/spectralis
9. Topcon Maestro2 产品页 — https://topconhealthcare.com/products/maestro2/
10. Topcon Maestro2 US Brochure PDF — https://cdn.brandfolder.io/I6S47VV/at/qc6ni7-2x06f4-1nvcqt/Maestro2_US_Brochure.pdf
11. Topcon Harmony 产品页 — https://topconhealthcare.com/products/harmony/
12. Topcon DICOM OCT Export 新闻稿 — https://topconhealthcare.com/article/topcon-healthcare-expands-access-to-standardized-dicom-oct-imaging-data/
13. Canon Xephilio OCT-A1 产品页 — https://us.medical.canon/products/eye-care/xephilio-oct-a1/
14. Canon Xephilio OCT-A1 Sales Sheet PDF — https://us.medical.canon/download/ec-ss-oct-a1

标准与工程：
15. DICOM PS3.3 A.33 GSPS IOD — https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.33.html
16. DICOM PS3.3 C.10.5 Graphic Annotation — https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.5.html
17. DICOM PS3.3 C.10.4 Displayed Area — https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.10.4.html
18. DICOM PS3.14 GSDF 定义 — https://dicom.nema.org/medical/dicom/current/output/chtml/part14/chapter_3.html
19. IHE Consistent Presentation of Images — https://wiki.ihe.net/index.php/Consistent_Presentation_of_Images
20. AAPM TG18（OR_03）— https://www.aapm.org/pubs/reports/OR_03.pdf
21. AAPM TG270（RPT_270）— https://www.aapm.org/pubs/reports/RPT_270.pdf
22. Apple Fonts — https://developer.apple.com/fonts/
23. Microsoft Typography in Windows — https://learn.microsoft.com/en-us/windows/apps/design/style/typography
24. Noto CJK 官方仓库 — https://github.com/notofonts/noto-cjk
25. MDN font-variant-numeric — https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric

截图证据（厂商官网发布）：
26. HEYEX cscr.jpg — https://www.heidelbergengineering.com/globalassets/media/marketing/images/products/heidelberg-eye-explorer/clinical-images/heyex-2/cscr.jpg
27. HEYEX multi-modality-viewer.jpg — https://www.heidelbergengineering.com/globalassets/media/marketing/images/products/heidelberg-eye-explorer/clinical-images/heyex-pacs/2025_09_11_10_54_16_heyex_multi_modality_viewer.jpg
28. ZEISS CIRRUS 6000 gallery / Retina Workplace 界面图 — 见来源 4（页面图库）
