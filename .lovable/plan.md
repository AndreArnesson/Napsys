# Napsys – Investment Analysis Platform

## Overview
A sophisticated investment analysis tool for tracking your personal "arsenal" of companies, performing valuations, calculating Margin of Safety (MOS), and sharing insights with other investors.

---

## ✅ Completed Features

### 1. Authentication & User Management
- ✅ Google OAuth and email/password login via Supabase Auth
- ✅ User profiles with preferences (default currency, language)
- ✅ Session persistence and secure logout

### 2. Internationalization (i18n)
- ✅ Full support for Swedish (default) and English
- ✅ Language toggle in header/settings
- ✅ All financial terms translatable

### 3. Dashboard – Company Arsenal
- ✅ Overview grid of all tracked companies
- ✅ "My Companies" and "Shared with Me" sections
- ✅ Quick search and filter options
- ✅ "Add Company" button

### 4. Company Profile Page
#### Overview Tab (Enhanced)
- ✅ Key Data Editor (Ticker, Price, Shares, Currencies, Market Cap)
- ✅ Collapsible Description section (rich text)
- ✅ Collapsible Moats/Competitive Advantages section
- ✅ CEO Subsection (name, since, background, ownership, compensation, notes)
- ✅ Insider Ownership Visualization (pie chart)
- ✅ File Import Dialog (Excel/CSV)

#### Financials Tab (Enhanced)
- ✅ Toggle between Yearly and Quarterly views
- ✅ 5-year historical trends with charts
- ✅ Quarterly breakdown with scrollable table
- ✅ Revenue, EBIT, EBITDA, Net Income, Margins

#### Balance Sheet Tab
- ✅ Historical financial position charts
- ✅ Total Assets, Liabilities, Equity tracking
- ✅ Key ratios (Debt/Equity, Current Ratio, Equity Ratio)

#### Insider Trading Tab (New)
- ✅ Table of insider transactions from FI
- ✅ Search/filter by person name
- ✅ Buy/Sell badges with color coding
- ✅ Volume, price, and total value display

#### Timeline Tab
- ✅ Vertical chronological timeline of events
- ✅ Date, rating, comments, insider activity

### 5. File Import System (New)
- ✅ FileImportDialog component
- ✅ Support for Börsdata Excel exports (XLSX)
- ✅ Support for FI insider trading CSV
- ✅ Drag-and-drop upload interface
- ✅ Import status feedback

### 6. Analysis Page (Revamped - Not a Wizard)
- ✅ Persistent, auto-saving workspace
- ✅ **Side-by-side data view** - see historical data while writing
- ✅ **Multiple analyses per company** - create and switch between analyses
- ✅ **Previous analyses list** - view and select past analyses
- ✅ **Estimates Editor** - set yearly/quarterly projections
- ✅ Rating & Summary moved to bottom (after reviewing data)
- ✅ Valuation inputs (Target P/E, EV/EBIT)
- ✅ MOS calculation displayed prominently
- ⏳ DCF removed (per user request)

### 7. Margin of Safety (MOS) Display
- ✅ Color-coded badges
- ✅ Prominent display on company cards and analysis page

### 8. Multi-Currency Support
- ✅ Reporting Currency and Trading Currency fields
- ✅ Currency selectors on Key Data Editor

---

## 🔄 In Progress

### Smart Paste AI Component
- Edge function for parsing raw text (board members, insider trades)
- Uses OpenAI GPT-4 to format into structured tables

### Sharing System
- Share analysis via email invitation
- Read-only permissions

---

## 📋 Remaining Tasks

1. **Real Excel Parsing** - Implement xlsx library for proper Börsdata import
2. **FI CSV Parsing** - Handle Swedish encoding issues in FI exports
3. **Smart Paste AI** - Edge function with OpenAI integration
4. **Quarterly Estimates** - Save to quarterly_estimates table
5. **Timeline Events** - Auto-create events on analysis save
6. **Real Financial Data** - Replace mock data with actual DB data
7. **Board of Directors** - Smart Paste formatted table

---

## Technical Stack
- React + Vite + TypeScript
- Tailwind CSS + Shadcn UI
- Supabase (Auth, Database, Storage)
- Recharts for visualizations
- i18n with context/hooks pattern

## Database Tables
- profiles, companies, analyses, timeline_events
- income_statement, balance_sheet, quarterly_estimates
- shares (for sharing)
