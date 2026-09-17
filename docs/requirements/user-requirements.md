# Civic Radar — User Requirements Document (URD)

## 1. Introduction

### 1.1 Purpose

This document describes Civic Radar from the point of view of the people who use it: what they need to accomplish, and why. It intentionally leaves out data storage design, table structures, API routes, and other implementation detail, focusing only on user-facing needs and goals.

### 1.2 Scope

Civic Radar is a browser-based civic information platform that helps residents of a pilot municipality understand and act on what their local government is doing. The platform collects public meeting agendas, minutes, and voting records, uses AI to summarize and classify them, matches relevant items to each user's stated interests and location, and helps users track issues and reach out to officials. For the semester, the platform supports one pilot municipality and a limited number of government bodies.

### 1.3 Intended Audience

This document is for anyone who needs to understand *what the product must do for its users* without wading through schema design: teammates building each feature area, the course instructor evaluating the project, and anyone validating that a build actually serves the people it's for.

### 1.4 User Classes

| User class | Description |
|---|---|
| **Resident** | An individual living in the pilot municipality who wants to follow and act on local government activity. |
| **Organization user** | A journalist or community organization representative who follows government activity at a broader or more research-oriented level than an individual resident. |
| **First-time user** | Any user, on their very first login, before they've learned the app's layout. |

### 1.5 Operating Environment

A standard web browser, no installed client.

> **Team to define:** expected scale target for the pilot — e.g., number of registered residents, number of tracked government bodies.

---

## 2. General User Needs
*(Team Member 1 — Platform & Jurisdictions)*

Covers account creation, interest selection, jurisdiction matching, and account/organization management.

**CR-1xx —**
As a resident, I want to select the local issues that matter to me, such as housing, transportation, or school budgets, so that the platform surfaces the small number of government items that affect my life instead of everything my town discusses.

**CR-1xx —**
As a resident, I want to see when the platform last retrieved information from the government source, so that I know whether an empty or unchanged view means nothing happened or means the data is stale.

**CR-1xx —**
As an organization administrator, I want to assign different permission levels to people in my organization, so that all of my staff can use the platform's tools while only a trusted few can add or remove members and change shared settings.

**CR-1xx —**
As a system administrator, I want to manage the list of topics, towns, and governing bodies available in the platform, so that the options users select from stay accurate as local government changes, without requiring a code change or redeployment.

**CR-1xx —**
As a resident, I want to review a record of recent activity on my account, including sign-ins, setting changes, and permission changes, so that I can recognize unauthorized access to an account that holds my location and political interests.

**CR-1xx —**
As a system administrator, I want to suspend and later restore a user or organization account, so that I can respond to abuse or a compromised account without permanently destroying that user's data.

---

## 3. Browsing Government Documents & Officials
*(Team Member 2 — Document Processing, Officials & Voting Data)*

Covers viewing meetings/documents, the officials directory, and voting records.

**CR-2xx —**
As a _____, I want _____, so that _____.

**CR-2xx —**
As a _____, I want _____, so that _____.

**CR-2xx —**
As a _____, I want _____, so that _____.

**CR-2xx —**
As a _____, I want _____, so that _____.

**CR-2xx —**
As a _____, I want _____, so that _____.

> *(add more as needed)*

---

## 4. AI Summaries & Search
*(Team Member 3 — AI Document Understanding & Search)*

Covers plain-English summaries, topic classification, and semantic search.

**CR-3xx —**
As a _____, I want _____, so that _____.

**CR-3xx —**
As a _____, I want _____, so that _____.

**CR-3xx —**
As a _____, I want _____, so that _____.

**CR-3xx —**
As a _____, I want _____, so that _____.

**CR-3xx —**
As a _____, I want _____, so that _____.

> *(add more as needed)*

---

## 5. Interest Matching, Alerts & Digest
*(Team Member 4 — Matching, Alerts & Digest)*

Covers alert delivery, notification preferences, and the weekly digest.

**CR-4xx —**
As a _____, I want _____, so that _____.

**CR-4xx —**
As a _____, I want _____, so that _____.

**CR-4xx —**
As a _____, I want _____, so that _____.

**CR-4xx —**
As a _____, I want _____, so that _____.

**CR-4xx —**
As a _____, I want _____, so that _____.

> *(add more as needed)*

---

## 6. Tracking Issues & Civic Action

----------------------------------------------------------------------------------------------------------------
## 5. Website & User Experience

*(Team Member 5 — Website & User Experience)*

Covers the main user interface, dashboard, issue tracking, officials directory, search interface, document viewing, and AI-assisted letter drafting.

**CR-501 — Local Government Dashboard**

As a **user**, I want to view a dashboard of local government activity, so that I can quickly see what is happening in my community.

**CR-502 — Issue Details**

As a **user**, I want to select a local issue or proposal and view its details, so that I can understand what the issue is about and why it matters.

**CR-503 — Issue Status Tracking**

As a **user**, I want to see the current status and history of an issue or proposal, so that I can understand how it has progressed over time.

**CR-504 — Officials Directory**

As a **user**, I want to browse a directory of local government officials, so that I can learn who represents my community.

**CR-505 — Official Information**

As a **user**, I want to view information about a specific local official, so that I can learn about their role and relevant voting activity.

**CR-506 — Search**

As a **user**, I want to search local government information using everyday language, so that I can find relevant meetings, issues, officials, and documents without knowing specific government terminology.

**CR-507 — Search Results**

As a **user**, I want to see relevant search results in an organized format, so that I can easily choose the information that is most useful to me.

**CR-508 — Document Viewer**

As a **user**, I want to open and view government documents within the website, so that I can read the original source without leaving the application.

**CR-509 — AI-Assisted Letter Drafting**

As a **user**, I want AI to help me draft a letter to a local official about an issue, so that I can more easily communicate my concerns or opinions.

**CR-510 — Edit AI-Generated Letters**

As a **user**, I want to review and edit an AI-generated letter before using it, so that the final message reflects what I actually want to say.

**CR-511 — Navigation**

As a **user**, I want clear navigation between the dashboard, issues, officials, search, and other features, so that I can easily move through the application.

**CR-512 — Responsive Interface**

As a **user**, I want the website to display properly on different screen sizes, so that I can use Civic Radar on a computer, tablet, or mobile device.


## 7. Getting Started
*(shared / whoever owns onboarding)*

**CR-25 —**
As a _____, I want _____, so that _____.

**CR-26 —**
As a _____, I want _____, so that _____.

---

## 8. Constraints and Assumptions

- The product is browser-based; no native client is in scope for the semester.
- The platform supports **one pilot municipality** and a limited number of government bodies within it — not multi-city or nationwide coverage.
- The platform does **not** provide legal advice, predict political outcomes, or automatically send letters on a user's behalf.
- Document ingestion depends on the availability and consistency of the pilot municipality's public records portal (CivicClerk); inconsistent PDF formats are a known risk, not a scope failure.
- AI-generated summaries and letter drafts are assistive, not authoritative — users are expected to verify against source documents before relying on them for decisions.
