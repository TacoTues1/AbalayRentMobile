# Systems Requirements Specification (SRS)

## Abalay Rental Property Management System

Based on a full system scan of the **Abalay Rent** project codebase—consisting of both the **Abalay Rent Mobile App** (built with Expo SDK 54, React Native 0.81, and MapLibre GL) and the **Abalay Rent Web Portal** (built with Next.js 16, Tailwind CSS, Stripe/PayPal, and Gemini AI)—we have compiled the hardware and software specifications.

The tables below provide both the **Minimum Requirements** and **Recommended Requirements**, formatted exactly like the reference schema provided.

---

### 1. Smartphone Requirements (Abalay Mobile App)

This table mirrors the exact layout of the uploaded reference, customized precisely for the modern mobile architecture of the Abalay Mobile App.

#### Table 5. System Requirements for Smartphones

| Software Components                        | Minimum Requirements                                                                                                        | Recommended Requirements                                                                                                                       |
| :----------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| **Processor**                              | Quad-core CPU, 1.8 GHz<br>(e.g., Snapdragon 450, MediaTek Helio G25, Apple A11 Bionic)                                      | Octa-core CPU, 2.4 GHz or higher<br>(e.g., Snapdragon 600/700 series, Apple A14 Bionic or newer)                                               |
| **Battery**                                | 3,000 mAh (Lithium-Ion / Polymer)                                                                                           | 4,500 mAh or higher with fast charging                                                                                                         |
| **Storage and Random-Access Memory (RAM)** | 32 GB Internal Storage<br>(Minimum 250 MB free space for app data/caches)<br>• **Android**: 3 GB RAM<br>• **iOS**: 2 GB RAM | 128 GB Internal Storage<br>(Supports offline leases & photo-heavy cache)<br>• **Android**: 6 GB RAM or higher<br>• **iOS**: 4 GB RAM or higher |
| **Size and Display Resolution**            | 5.0-inch LCD, HD resolution<br>(720 x 1600 pixels)                                                                          | 6.1-inch or larger OLED/AMOLED<br>(2400 x 1080 pixels), HDR10+ support                                                                         |
| **Operating System (OS)**                  | • **Android**: Android 7.0 (Nougat, API Level 24)<br>• **iOS**: iOS 15.1 or higher                                          | • **Android**: Android 11.0 (API Level 30) or newer<br>• **iOS**: iOS 16.0 or newer                                                            |
| **Connectivity & Location Services**       | 3G/4G LTE cellular data or Wi-Fi<br>Standard GPS / Network Location Services                                                | 4G LTE / 5G cellular connectivity, dual-band Wi-Fi<br>High-accuracy A-GPS / GLONASS                                                            |
| **Camera & Multimedia**                    | 5 MP rear-facing camera<br>Standard built-in microphone                                                                     | 12 MP or higher rear-facing camera with auto-focus<br>Noise-canceling microphone input                                                         |

> [!NOTE]
> **Why are these Smartphone specifications required for Abalay?**
>
> - **Processor & RAM:** Abalay incorporates interactive maps using `@maplibre/maplibre-react-native` and embedded WebViews (`react-native-webview`), alongside heavy charts (`react-native-chart-kit` with `react-native-svg`). An octa-core processor and higher RAM ensure smooth rendering and fluid navigation without UI micro-stutters.
> - **Storage:** While the app package itself is small (~50 MB), users frequently upload and cache rental photos, lease PDF files (`expo-document-picker`), and maintenance receipts.
> - **Operating System:** Built using **Expo SDK 54**, the app relies on library compilation levels that require a minimum of Android API Level 24 (Android 7.0) and iOS 15.1.
> - **Camera & Microphone:** Needed for profile verification, landlord listing uploads (`expo-image-picker`), and maintenance requests where landlords or tenants might upload voice memos or short video attachments (`expo-av`).

---

### 2. Desktop/Laptop Client Requirements (Abalay Web Portal)

Because the Abalay Rent ecosystem includes a Next.js-driven web dashboard (for analytics, Brevo email configurations, Stripe/PayPal payment handling, and Gemini AI queries), the following computer requirements are recommended for landlords/admins utilizing the web management interface.

#### Table 6. Desktop System Requirements (Landlord/Admin Web Portal)

| System Components               | Minimum Requirements                                                                                     | Recommended Requirements                                                                                          |
| :------------------------------ | :------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Processor (CPU)**             | Dual-core CPU, 2.0 GHz<br>(e.g., Intel Core i3 7th Gen or AMD Ryzen 3)                                   | Quad-core CPU, 2.5 GHz or higher<br>(e.g., Intel Core i5/i7 10th Gen, AMD Ryzen 5/7, or Apple M-series)           |
| **System Memory (RAM)**         | 4 GB RAM                                                                                                 | 8 GB or 16 GB DDR4/DDR5 RAM                                                                                       |
| **Storage (SSD/HDD)**           | 10 GB available HDD space                                                                                | 20 GB available SSD space (for rapid browser data cache)                                                          |
| **Size and Display Resolution** | 13-inch display, HD<br>(1366 x 768 pixels)                                                               | 15.6-inch or larger, Full HD<br>(1920 x 1080 pixels) or higher                                                    |
| **Operating System (OS)**       | • **Windows**: Windows 10 (64-bit)<br>• **macOS**: macOS 11.0 (Big Sur)<br>• **Linux**: Ubuntu 20.04 LTS | • **Windows**: Windows 11 (64-bit)<br>• **macOS**: macOS 13.0 (Ventura) or newer<br>• **Linux**: Ubuntu 22.04 LTS |
| **Web Browser**                 | Google Chrome v100+, Mozilla Firefox v100+, Microsoft Edge v100+, Safari v15+                            | Google Chrome (Latest Version), Apple Safari (Latest), or Microsoft Edge (Latest)                                 |
| **Network & Internet**          | 5 Mbps broadband internet connection                                                                     | 20 Mbps or higher high-speed fiber-optic connection                                                               |

> [!TIP]
> **Why are these Web specifications required?**
>
> - **Complex Graphics Rendering:** The Web Portal leverages MapLibre GL and Leaflet for geolocation mapping and `Recharts` for live interactive graphs. A dedicated multi-core CPU and sufficient system RAM ensure browsers can parse layout scripts instantly.
> - **Latest Browser Engines:** Modern web APIs used in Stripe checkout elements, PayPal payment scripts, and local JSON operations depend heavily on current-generation JavaScript standards. Using modern, updated browsers ensures all features run error-free.

---

### 3. Server-Side & Third-Party Infrastructure Requirements

For full completeness, Abalay's backend acts as a serverless platform utilizing the following configurations:

- **Database Engine:** Supabase PostgreSQL with built-in Row-Level Security (RLS) policies, Realtime publication channels, and database triggers.
- **Serverless Functions:** Supabase Edge Functions / Next.js Serverless API endpoints for executing scheduled cron-jobs (such as automated late-payment reminders and contract terminations).
- **AI Integration:** Google Gemini API (`@google/genai` & `@google/generative-ai`) for smart landlord replies, listing descriptions, and tenant message translation.
- **SMTP Gateway:** Brevo (Sendinblue) API for transaction receipts, OTP codes, and platform notification routing.
- **Payment API Gateways:** Stripe API (credit/debit processing) and PayPal REST API SDK.
- **Hosting Platform:** Vercel (Web Server hosting) & Expo Application Services (EAS) for compiling Android packages (.APK/AAB) and iOS build packages (.IPA).
- **Database Engine:** Supabase PostgreSQL with built-in Row-Level Security (RLS) policies, Realtime publication channels, and database triggers.
- **Serverless Functions:** Supabase Edge Functions / Next.js Serverless API endpoints for executing scheduled cron-jobs (such as automated late-payment reminders and contract terminations).
- **AI Integration:** Google Gemini API (`@google/genai` & `@google/generative-ai`) for smart landlord replies, listing descriptions, and tenant message translation.
- **SMTP Gateway:** Brevo (Sendinblue) API for transaction receipts, OTP codes, and platform notification routing.
- **Payment API Gateways:** Stripe API (credit/debit processing) and PayPal REST API SDK.
- **Hosting Platform:** Vercel (Web Server hosting) & Native Build Pipelines (Android SDK & Xcode) for compiling Android packages (.APK/AAB) and iOS build packages (.IPA).
