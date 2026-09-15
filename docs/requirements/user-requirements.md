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
As a _____, I want _____, so that _____.

**CR-1xx —**
As a _____, I want _____, so that _____.

**CR-1xx —**
As a _____, I want _____, so that _____.

**CR-1xx —**
As a _____, I want _____, so that _____.

> *(add more as needed)*

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
*(Team Member 5 — Website & User Experience)*

Covers the dashboard, issue tracking, document viewing, and letter drafting.

**CR-5xx —**
As a _____, I want _____, so that _____.

**CR-5xx —**
As a _____, I want _____, so that _____.

**CR-5xx —**
As a _____, I want _____, so that _____.

**CR-5xx —**
As a _____, I want _____, so that _____.

**CR-5xx —**
As a _____, I want _____, so that _____.

> *(add more as needed)*

---

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
