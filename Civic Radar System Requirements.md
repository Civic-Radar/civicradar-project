**Civic Radar — Software Requirements Specification**

**CSC 351 · Team Civic Radar (KJ, MS, AO, EG, YA) · September 23, 2026**

# **1\. Introduction**

## **1.1 Purpose**

This document expands every user requirement in the Civic Radar User Requirements Document (URD) into detailed, testable system requirements. It is written for the developers who will build Civic Radar and the testers who will verify it.

## **1.2 Scope**

Civic Radar is a browser-based platform that helps residents follow local government meetings and published documents for a defined catalog of supported towns. It retrieves meetings and documents from each town's CivicClerk portal, summarizes documents with AI, matches meetings to each resident's followed towns and topics, and sends meeting alerts and a weekly email digest. Salem, MA is the verified pilot town.

## **1.3 How to read this document**

1\.   Requirements are grouped under the same functional areas as the URD, in the same order.

2\.   Each user requirement (UR) is quoted from the URD and followed by the SRS requirements that expand it. An SRS number always starts with its parent UR number (UR-101 expands into SRS-101.1, SRS-101.2, and so on).

3\.   Each SRS requirement is written as: **SRS-\#.\#, Initials, Title.** followed by one "shall" statement and its "Traces to" line.

4\.   Non-functional requirements are numbered separately as SRS-NFR-\# in Section 7\.

5\.   Each SRS requirement includes Given/When/Then acceptance criteria that a tester can mark pass or fail.

6\.   Gaps in SRS numbering are intentional. Numbers from earlier drafts are never reused.

## **1.4 Definitions**

1\.   **Supported town:** A town in the platform catalog that has a configured source account and meeting time zone (SRS-104.6).

2\.   **Meeting:** One meeting occurrence published by a supported town's source, identified by its town and source meeting identifier.

3\.   **Tracked meeting:** A meeting whose start time is in the future or within the past 90 days.

4\.   **Document:** A published agenda, agenda packet, minutes file, or other file that the source lists under a meeting.

5\.   **Agenda item:** An item the source explicitly lists as part of one meeting's agenda.

6\.   **Relevant meeting:** A meeting that belongs to one of the resident's followed towns and has at least one of the resident's followed topic tags, or a meeting the resident follows directly.

7\.   **Monitored change:** A change to a meeting's start time, location, online participation link, or explicit cancellation status; an added or removed agenda item; or a newly published document or recording.

8\.   **Meeting update:** A stored record of a new relevant meeting or a monitored change, including its first-detected time.

9\.   **Local start time:** A meeting's start time converted using its town's configured meeting time zone.

10\. **Successful check:** A scheduled source check in which every page of every requested collection was read without error.

11\. **Email types:** (1) Upcoming meetings and schedule changes; (2) Agenda items and other meeting materials; (3) Available minutes and recordings.

12\. **Reporting period:** The time from the previous scheduled digest (inclusive) to the current scheduled digest (exclusive).

13\. **Status labels:** "Not provided by the source" (the source omitted a field); "Could not check the source" (a check failed); "Not available from this source" (the town's source does not support the feature).

14\. **Preferences page:** A page containing the towns, topics, and email settings for the users; they can change any preference there.

 

# **2\. General User Needs**

## **UR-101 — Topic Selection**

**UR-101, KJ — Topic selection.** As a resident, I want to select the local issues that matter to me, such as housing, transportation, or school budgets, so that the platform surfaces the small number of government items that affect my life instead of everything my town discusses.

**SRS-101.1, KJ, Topic list display.** The system shall display every topic in the platform catalog when the resident opens the topic selection section.

**Acceptance Criteria:** Given the catalog contains the topics Housing, Parking, and Budget, When the resident opens the topic selection section, Then all three topics are displayed.

Traces to: UR-101

**SRS-101.2, KJ, Topic selection.** The system shall mark a topic as selected when the resident selects that topic on the topic selection section.

**Acceptance Criteria:** Given the topic selection section is displayed, When the resident selects Housing, Then Housing is marked as selected.

Traces to: UR-101

**SRS-101.3, KJ, Topic deselection.** The system shall remove the selected mark from a topic when the resident deselects that topic on the topic selection section.

**Acceptance Criteria:** Given Housing is marked as selected, When the resident deselects Housing, Then Housing is no longer marked as selected.

Traces to: UR-101

**SRS-101.4, KJ, Saved topic preferences.** The system shall store the resident's selected topics as their followed topics when the resident saves the topic selection section.

**Acceptance Criteria:** Given the resident selects Housing and Parking and saves the page, When the resident signs out, signs back in, and opens the topic selection section, Then Housing and Parking are marked as selected.

Traces to: UR-101

## **UR-102 — Data Freshness**

**UR-102, KJ — Data freshness.** As a resident, I want to see when the platform last retrieved information from the government source, so that I know whether an empty or unchanged view means nothing happened or means the data is stale.

**SRS-102.1, KJ, Last check time display.** The system shall display the date and time of the most recent successful check for each followed town when the resident views the data freshness information.

**Acceptance Criteria:** Given Salem's most recent successful check ended on 09/23/2026 at 2:00 PM ET, When the resident views the data freshness information, Then "09/23/2026 2:00 PM ET" is displayed for Salem.

Traces to: UR-102

**SRS-102.2, KJ, Failed check label.** The system shall display "Could not check the source" for a followed town when that town's most recent check was not successful.

**Acceptance Criteria:** Given Salem's most recent check was not successful, When the resident views the data freshness information, Then "Could not check the source" is displayed for Salem.

Traces to: UR-102

**SRS-102.3, KJ, No new information label.** The system shall display "Checked — no new information" for a followed town when that town's most recent check was successful and found no new or changed records.

**Acceptance Criteria:** Given Salem's most recent check was successful and found no new or changed records, When the resident views the data freshness information, Then "Checked — no new information" is displayed for Salem and "Could not check the source" is not.

Traces to: UR-102

## **UR-103 — Organization Permissions**

**UR-103, KJ — Organization permissions.** As an organization administrator, I want to assign different permission levels to people in my organization, so that all of my staff can use the platform's tools while only a trusted few can add or remove members and change shared settings.

**SRS-103.1, KJ, Member permission display.** The system shall display each member's permission level when an organization administrator opens the organization member list.

**Acceptance Criteria:** Given an organization has three members with assigned permission levels, When an organization administrator opens the member list, Then each member's permission level is displayed next to that member.

Traces to: UR-103

**SRS-103.2, KJ, Permission assignment.** The system shall save a member's new permission level when an organization administrator assigns that level to the member.

**Acceptance Criteria:** Given a member is listed in the organization, When an organization administrator assigns a different permission level to that member, Then the member list shows the newly assigned level for that member.

Traces to: UR-103

**SRS-103.3, KJ, Membership change restriction.** The system shall deny a request to add or remove an organization member when the requesting member lacks the member-management permission.

**Acceptance Criteria:** Given a member does not have the member-management permission, When that member attempts to add or remove another member, Then the system denies the action and the member list is unchanged.

Traces to: UR-103

**SRS-103.4, KJ, Shared settings restriction.** The system shall deny a request to change a shared organization setting when the requesting member lacks the settings permission.

**Acceptance Criteria:** Given a member does not have the settings permission, When that member attempts to change a shared organization setting, Then the system denies the action and the setting is unchanged.

Traces to: UR-103

## **UR-104 — Platform Catalog Management**

**UR-104, KJ — Platform catalog management.** As a system administrator, I want to manage the list of topics, towns, and governing bodies available in the platform, so that the options users select from stay accurate as local government changes, without requiring a code change or redeployment.

**SRS-104.1, KJ, Catalog management access.** The system shall display the catalog management page when a signed-in system administrator opens it.

**Acceptance Criteria:** Given a system administrator is signed in, When the administrator opens the catalog management page, Then the page displays the controls to add, edit, and remove catalog entries.

Traces to: UR-104

**SRS-104.2, KJ, Catalog entry creation.** The system shall add a topic, town, or governing body to the catalog when a system administrator saves a new entry with every required field completed.

**Acceptance Criteria:** Given the administrator enters every required field for a new topic named "Parks", When the administrator saves the entry, Then "Parks" appears in the catalog.

Traces to: UR-104

**SRS-104.3, KJ, Catalog entry modification.** The system shall update a catalog entry when a system administrator saves changes to that entry.

**Acceptance Criteria:** Given the topic "Parks" exists, When the administrator renames it to "Parks & Recreation" and saves, Then the catalog shows "Parks & Recreation" and no longer shows "Parks".

Traces to: UR-104

**SRS-104.4, KJ, Catalog entry removal.** The system shall remove a catalog entry from every resident selection list when a system administrator confirms removal of that entry.

**Acceptance Criteria:** Given the topic "Parks" exists, When the administrator confirms its removal, Then "Parks" no longer appears on the resident topic selection section.

Traces to: UR-104

**SRS-104.5, KJ, Catalog changes without redeployment.** The system shall show a saved catalog change in resident selection lists without an application redeployment when a system administrator saves the change.

**Acceptance Criteria:** Given the administrator saves a new town, When a resident opens town preferences without any application redeployment, Then the new town is listed.

Traces to: UR-104

**SRS-104.6, KJ, Town source settings.** The system shall require a source account identifier and a meeting time zone when a system administrator saves a new or edited town.

**Acceptance Criteria:**

•       Given an administrator enters Salem with source account identifier "salemma" and meeting time zone America/New\_York, When the administrator saves the town, Then the town is saved with both values.

•       Given the source account identifier is blank, When the administrator saves the town, Then the save is rejected and the missing field is identified.

Traces to: UR-104

## **UR-105 — Account Activity History**

**UR-105, KJ — Account activity history.** As a resident, I want to review a record of recent activity on my account, including sign-ins, setting changes, and permission changes, so that I can recognize unauthorized access to an account that holds my location and political interests.

**SRS-105.1, KJ, Activity history display.** The system shall display the 50 most recent activity records for the account when the account owner opens the activity history page.

**Acceptance Criteria:** Given the account has 60 activity records, When the account owner opens the activity history page, Then the 50 most recent records are displayed.

Traces to: UR-105

**SRS-105.2, KJ, Activity type label.** The system shall label each activity record as Sign-in, Settings change, or Permission change when the activity history is displayed.

**Acceptance Criteria:** Given the history contains a sign-in, a settings change, and a permission change, When the activity history is displayed, Then the records are labeled Sign-in, Settings change, and Permission change.

Traces to: UR-105

**SRS-105.3, KJ, Activity timestamp.** The system shall display the date and time of each activity record when the activity history is displayed.

**Acceptance Criteria:** Given a sign-in occurred on 09/20/2026 at 8:15 AM, When the activity history is displayed, Then that record shows 09/20/2026 8:15 AM.

Traces to: UR-105

**SRS-105.4, KJ, Activity history privacy.** The system shall deny a signed-in resident's request to view the activity history of another account.

**Acceptance Criteria:** Given resident A is signed in, When resident A requests resident B's activity history, Then the system denies access and shows none of resident B's records.

Traces to: UR-105

## **UR-106 — Account Suspension**

**UR-106, KJ — Account suspension.** As a system administrator, I want to suspend and later restore a user or organization account, so that I can respond to abuse or a compromised account without permanently destroying that user's data.

**SRS-106.1, KJ, Account suspension.** The system shall set an active user or organization account's status to Suspended when a system administrator suspends that account.

**Acceptance Criteria:** Given an active user account exists, When a system administrator suspends the account, Then the account's status is Suspended.

Traces to: UR-106

**SRS-106.2, KJ, Suspended account access.** The system shall deny every request from a suspended account to use an authenticated function.

**Acceptance Criteria:** Given an account is suspended, When that account attempts to open the dashboard, Then the system denies access.

Traces to: UR-106

**SRS-106.3, KJ, Account restoration.** The system shall set a suspended account's status to Active when a system administrator restores that account.

**Acceptance Criteria:** Given an account is suspended, When a system administrator restores the account, Then the account's status is Active.

Traces to: UR-106

**SRS-106.4, KJ, Data kept during suspension.** The system shall keep all of an account's stored data unchanged while the account is suspended.

**Acceptance Criteria:** Given an account follows two towns and three topics, When the account is suspended and later restored, Then the account still follows the same two towns and three topics.

Traces to: UR-106

## **UR-107 — First-Time Setup**

**UR-107, KJ — First-time setup.** As a first-time user, I want to be guided to choose my towns and topics when I first sign in, so that my dashboard shows relevant meetings from the start instead of an empty page.

**SRS-107.1, KJ, Setup start.** The system shall open the town selection section when a user who has not completed or skipped first-time setup signs in.  
 Acceptance Criteria: Given a user has never completed or skipped first-time setup, When the user signs in, Then the town selection section opens instead of the dashboard.  
 Traces to: UR-107

**SRS-107.2, KJ, Setup next step.** The system shall open the topic selection section when a user in first-time setup saves their town preferences.  
**Acceptance Criteria:** Given a user in first-time setup has selected Salem on the town selection section, When the user saves, Then the topic selection section opens.  
Traces to: UR-107

**SRS-107.3, KJ, Setup skip.** The system shall open the dashboard and mark first-time setup as skipped when a user in first-time setup selects "Skip for now".  
**Acceptance Criteria:** Given a user is in first-time setup, When the user selects "Skip for now", Then the dashboard opens and the user is not sent to setup on the next sign-in.  
 Traces to: UR-107

**SRS-107.4, KJ, Setup completion.** The system shall open the dashboard on every sign-in after the user has saved the topic selection section during first-time setup.  
**Acceptance Criteria:** Given a user saved Salem and Housing during first-time setup, When the user signs out and signs back in, Then the dashboard opens.  
Traces to: UR-107

## **UR-108 — Shared Organization Follows**

**UR-108, KJ — Shared organization follows.** As an organization user, I want my organization to share one set of followed towns and topics, so that everyone on our team tracks the same local issues without each member setting them up separately.

**SRS-108.1, KJ, Shared follows setup.** The system shall save the organization's shared towns and topics when a member with the settings permission saves them.  
**Acceptance Criteria:** Given a member has the settings permission, When that member selects Salem and Housing as shared follows and saves, Then Salem and Housing are stored as the organization's shared follows.  
Traces to: UR-108

**SRS-108.2, KJ, Shared follows applied.** The system shall treat the organization's shared towns and topics as followed towns and topics for every member of that organization.  
**Acceptance Criteria:** Given the organization shares Salem and Housing and a member follows no towns or topics personally, When that member opens the dashboard, Then meetings in Salem tagged Housing are shown as relevant.  
Traces to: UR-108

**SRS-108.3, KJ, Shared follows display.** The system shall mark each shared town and topic as "Shared by your organization" and prevent the member from deselecting it on the town selection section and topic selection section.  
**Acceptance Criteria:** Given the organization shares Housing, When a member opens the topic selection section, Then Housing is marked "Shared by your organization" and cannot be deselected.  
Traces to: UR-108

**SRS-108.4, KJ, Shared follows on removal.** The system shall stop applying an organization's shared follows to a member when that member is removed from the organization, while keeping the member's personal follows.  
**Acceptance Criteria:** Given the organization shares Salem and the member personally follows Parking, When the member is removed from the organization, Then the member no longer follows Salem through the organization and still follows Parking.  
Traces to: UR-108

 

# **3\. Document Retrieval, Storage & AI Summarization**

## **UR-201 — Document List View**

**UR-201, MS — Document List View.** As a user, I want to view a list of documents retrieved from CivicClerk for the towns I follow, so that I can see recent government activity without checking each town's CivicClerk page myself.

**SRS-201.1, MS, Followed-towns list.** The system shall list only documents from the user's followed towns when a signed-in user who follows at least one town opens the Documents page.

**Acceptance Criteria:** Given the user follows Town A only, and 5 Town A documents and 3 Town B documents have been retrieved, When the user opens the Documents page, Then the list contains exactly the 5 Town A documents.

Traces to: UR-201

**SRS-201.2, MS, Empty list message.** The system shall display "No documents have been retrieved for the towns you follow yet." when the user follows at least one town and the "Towns I follow" scope contains zero documents.

**Acceptance Criteria:** Given the user follows Town A and zero Town A documents have been retrieved, When the user opens the Documents page, Then "No documents have been retrieved for the towns you follow yet." is displayed and no list entries appear.

Traces to: UR-201

**SRS-201.3, MS, Setup message.** The system shall display "Follow at least one town to see documents here." when a signed-in user who follows zero towns opens the Documents page with the "Towns I follow" scope selected.

**Acceptance Criteria:** Given the user follows no towns and 8 documents have been retrieved across all towns, When the user opens the Documents page, Then "Follow at least one town to see documents here." is displayed and no list entries appear.

Traces to: UR-201

**SRS-201.4, MS, Setup link.** The system shall display a link to the town selection section when the setup message in SRS-201.3 is displayed.

**Acceptance Criteria:** Given the setup message is displayed, When the user selects the town preferences link, Then the town selection section opens.

Traces to: UR-201

## **UR-202 — Document Identification**

**UR-202, MS — Document Identification.** As a user, I want each document in my list identified clearly (e.g., by name or meeting date), so that I can tell them apart at a glance.

**SRS-202.1, MS, Document title display.** The system shall display each document's title, as published by the source, on its list entry when the Documents page loads.

**Acceptance Criteria:** Given a document titled "City Council Regular Meeting" on CivicClerk, When the Documents page loads, Then its list entry shows "City Council Regular Meeting".

Traces to: UR-202

**SRS-202.2, MS, Meeting date display.** The system shall display each document's meeting date in MM/DD/YYYY format on its list entry when the Documents page loads.

**Acceptance Criteria:** Given a document for a meeting held September 14, 2026, When the Documents page loads, Then its list entry shows "09/14/2026".

Traces to: UR-202

**SRS-202.3, MS, Missing meeting date label.** The system shall display "Date not available" in place of the meeting date when the source provides no meeting date for a document.

**Acceptance Criteria:** Given a retrieved document with no meeting date, When the Documents page loads, Then its list entry shows "Date not available".

Traces to: UR-202

**SRS-202.4, MS, Governing body display.** The system shall display the name of the governing body that published each document on its list entry when the Documents page loads.

**Acceptance Criteria:** Given a document published by the Planning Board, When the Documents page loads, Then its list entry shows "Planning Board".

Traces to: UR-202

**SRS-202.5, MS, Document type label.** The system shall display exactly one type label (Agenda, Minutes, Packet, or Other) on each list entry when the Documents page loads.

**Acceptance Criteria:** Given a document CivicClerk classifies as meeting minutes, When the Documents page loads, Then its list entry shows exactly one type label, "Minutes".

Traces to: UR-202

## **UR-203 — Open Document PDF**

**UR-203, MS — Open Document PDF.** As a user, I want to open a specific document to view its PDF, so that I can read the original source material.

**SRS-203.1, MS, Open document detail page.** The system shall open a document's detail page when the user selects that document from the Documents page, a meeting details page, an alert, or search results.

**Acceptance Criteria:** Given the Documents page is displayed, When the user selects the entry for document X, Then the document detail page for document X opens.

Traces to: UR-203

**SRS-203.2, MS, In-page PDF display.** The system shall display the document's PDF inside the document detail page, without opening a new browser tab, when the detail page opens.

**Acceptance Criteria:** Given a document with a valid stored PDF, When the user opens its detail page, Then page 1 of the PDF is visible on that page and no new browser tab opens.

Traces to: UR-203

**SRS-203.3, MS, PDF available when source is down.** The system shall display a previously retrieved document's PDF when the user opens its detail page while CivicClerk is unreachable.

**Acceptance Criteria:** Given document X was retrieved and CivicClerk is unreachable, When the user opens document X's detail page, Then the PDF displays.

Traces to: UR-203

**SRS-203.4, MS, Return from detail page.** The system shall return the user to the page they came from when the user selects the back control on a document detail page.

**Acceptance Criteria:** Given the user opened document X from a meeting details page, When the user selects the back control, Then that meeting details page is displayed.

Traces to: UR-203

## **UR-204 — View Document Summary**

**UR-204, MS — View Document Summary.** As a user, I want to view a document's AI-generated summary, so that I don't have to read the full PDF to understand it.

**SRS-204.1, MS, Summary generation start.** The system shall start generating an AI summary of a document when retrieval of that document completes.

**Acceptance Criteria:** Given a new document is retrieved, When retrieval completes, Then a summary generation attempt for that document is recorded.

Traces to: UR-204

**SRS-204.2, MS, Summary display.** The system shall display a document's summary on its detail page when the document's summary status is Complete.

**Acceptance Criteria:** Given document X has a Complete summary, When the user opens its detail page, Then the summary text is displayed.

Traces to: UR-204

**SRS-204.3, MS, Stored summary reuse.** The system shall display the stored summary, without generating a new one, each time the detail page of a document with a Complete summary opens.

**Acceptance Criteria:** Given document X has a Complete summary, When the user opens its detail page twice, Then the summary text and its generation timestamp are identical both times.

Traces to: UR-204

**SRS-204.4, MS, AI-generated disclaimer.** The system shall display "AI-generated summary. Verify against the source document." directly above a summary whenever that summary is displayed.

**Acceptance Criteria:** Given document X has a Complete summary, When the user opens its detail page, Then "AI-generated summary. Verify against the source document." appears directly above the summary text.

Traces to: UR-204

**SRS-204.5, MS, Pending status assignment.** The system shall set a document's summary status to Pending when summary generation for that document starts.

**Acceptance Criteria:** Given summary generation for document X has started and not finished, When the user opens document X's detail page, Then its summary status is Pending.

Traces to: UR-204

## **UR-205 — Summary Placement**

**UR-205, MS — Summary Placement.** As a user, I want a document's summary displayed directly below its PDF, so that I can reference both without navigating elsewhere.

**SRS-205.1, MS, Summary positioned below PDF.** The system shall place the summary section directly below the PDF viewer, with no other section between them, when a document detail page opens.

**Acceptance Criteria:** Given document X has a Complete summary, When the user opens its detail page, Then the summary section is the first section below the PDF viewer.

Traces to: UR-205

## **UR-206 — Pending Summary Indicator**

**UR-206, MS — Pending Summary Indicator.** As a user, I want a document that doesn't have a summary yet to be clearly marked as pending, so that I know it's not missing by mistake.

**SRS-206.1, MS, Pending message on detail page.** The system shall display "Summary pending" in the summary section when the user opens the detail page of a document whose summary status is Pending.

**Acceptance Criteria:** Given document X has summary status Pending, When the user opens its detail page, Then "Summary pending" appears in the summary section.

Traces to: UR-206

**SRS-206.2, MS, Pending badge in list.** The system shall display a "Summary pending" badge on the list entry of each document whose summary status is Pending when the Documents page loads.

**Acceptance Criteria:** Given document X has summary status Pending, When the Documents page loads, Then document X's entry shows a "Summary pending" badge.

Traces to: UR-206

## **UR-207 — Summary Source Link**

**UR-207, MS — Summary Source Link.** As a user, I want each summary linked back to its exact source PDF, so that I can verify it against the original if I want to.

**SRS-207.1, MS, Source PDF link display.** The system shall display a "View source PDF" link in the summary section whenever a summary is displayed.

**Acceptance Criteria:** Given document X has a Complete summary, When the user opens its detail page, Then a "View source PDF" link appears in the summary section.

Traces to: UR-207

**SRS-207.2, MS, Source PDF link target.** The system shall open the exact PDF file the summary was generated from when the user selects "View source PDF".

**Acceptance Criteria:** Given the summary for document X is displayed, When the user selects "View source PDF", Then the PDF that opens is byte-identical to the file used to generate the summary.

Traces to: UR-207

**SRS-207.4, MS, Original CivicClerk link.** The system shall display an "Open on CivicClerk" link to the document's original CivicClerk page when a document detail page opens.

**Acceptance Criteria:** Given document X's detail page is open, When the user selects "Open on CivicClerk", Then the browser opens the CivicClerk page for document X.

Traces to: UR-207

## **UR-208 — Automatic Document Updates**

**UR-208, MS — Automatic Document Updates.** As a user, I want new documents to appear in my list automatically as they're published, so that I don't have to check CivicClerk myself.

**SRS-208.1, MS, Scheduled source check.** The system shall check CivicClerk for new documents for every supported town on a recurring schedule that meets SRS-NFR-9, without any user action.

**Acceptance Criteria:** Given no user is signed in, When one scheduled interval elapses, Then the retrieval log shows a completed CivicClerk check for every supported town for that interval.

Traces to: UR-208

**SRS-208.2, MS, New document added.** The system shall add a document to the document list when a scheduled check finds a document that has not been retrieved before.

**Acceptance Criteria:** Given a new agenda is published on CivicClerk, When the next scheduled check completes, Then the agenda appears on the Documents page.

Traces to: UR-208

**SRS-208.3, MS, Duplicate entry prevention.** The system shall not create a second list entry when a scheduled check finds a document whose source file identifier matches an already-retrieved document.

**Acceptance Criteria:** Given document X was already retrieved, When a later check finds a document with the same source file identifier, Then the Documents page still contains exactly one entry for document X.

Traces to: UR-208

**SRS-208.4, MS, Documents kept on failed check.** The system shall keep every previously retrieved document in the document list when a scheduled check cannot reach CivicClerk.

**Acceptance Criteria:** Given 40 documents are retrieved and CivicClerk is unreachable, When a scheduled check runs and fails, Then the Documents page still shows all 40 documents.

Traces to: UR-208

## **UR-209 — Document Sort Order**

**UR-209, MS — Document Sort Order.** As a user, I want my documents sorted with the most recent first, so that I can see the latest activity without scrolling.

**SRS-209.1, MS, Newest-first sort.** The system shall sort the document list by meeting date, newest first, when the Documents page loads.

**Acceptance Criteria:** Given documents with meeting dates 09/01, 09/08, and 09/15/2026, When the Documents page loads, Then they appear in the order 09/15, 09/08, 09/01.

Traces to: UR-209

**SRS-209.2, MS, Same-date tie-breaker.** The system shall order documents that share a meeting date by retrieval time, newest first, when the Documents page loads.

**Acceptance Criteria:** Given two documents dated 09/15/2026, retrieved at 9:00 AM and 2:00 PM, When the Documents page loads, Then the 2:00 PM document appears first.

Traces to: UR-209

**SRS-209.3, MS, Undated documents placement.** The system shall place documents with no meeting date after all dated documents when the Documents page loads.

**Acceptance Criteria:** Given 10 dated documents and 1 undated document, When the Documents page loads, Then the undated document is the 11th entry.

Traces to: UR-209

## **UR-210 — Failed Summary Notification**

**UR-210, MS — Failed Summary Notification.** As a user, I want to know if a document's summary failed to generate, so that I understand why it's not showing up.

**SRS-210.1, MS, Failed status assignment.** The system shall set a document's summary status to Failed when summary generation for that document fails 3 consecutive times.

**Acceptance Criteria:** Given summary generation for document X fails on attempts 1, 2, and 3, When the third attempt fails, Then document X's summary status is Failed.

Traces to: UR-210

**SRS-210.2, MS, Failed message on detail page.** The system shall display "A summary could not be generated for this document. You can still read the original PDF above." in the summary section when the user opens the detail page of a document whose summary status is Failed.

**Acceptance Criteria:** Given document X has summary status Failed, When the user opens its detail page, Then "A summary could not be generated for this document. You can still read the original PDF above." appears in the summary section.

Traces to: UR-210

**SRS-210.3, MS, Failed badge in list.** The system shall display a "Summary failed" badge on the list entry of each document whose summary status is Failed when the Documents page loads.

**Acceptance Criteria:** Given document X has summary status Failed, When the Documents page loads, Then document X's entry shows a "Summary failed" badge and no "Summary pending" badge.

Traces to: UR-210

## **UR-211 — PDF Access Without Summary**

**UR-211, MS — PDF Access Without Summary.** As a user, I want the option to view the raw PDF even if a summary isn't available yet, so that I can still access the source information.

**SRS-211.1, MS, PDF access for any summary status.** The system shall display a document's PDF when the user opens its detail page, whether the document's summary status is Pending, Complete, or Failed.

**Acceptance Criteria:** Given documents X, Y, and Z have summary status Pending, Complete, and Failed, When the user opens each detail page, Then each page displays its PDF.

Traces to: UR-211

## **UR-212 — Document Town Tag**

**UR-212, MS — Document Town Tag.** As a user, I want to see which town a document belongs to, so that I can tell it apart from documents of other towns.

**SRS-212.1, MS, Town tag in list.** The system shall display the name of each document's town on its list entry when the Documents page loads.

**Acceptance Criteria:** Given a document retrieved from Salem's CivicClerk portal, When the Documents page loads, Then its list entry shows the tag "Salem".

Traces to: UR-212

**SRS-212.2, MS, Town tag on detail page.** The system shall display the name of the document's town when the user opens a document detail page.

**Acceptance Criteria:** Given a document retrieved from Salem's CivicClerk portal, When the user opens its detail page, Then "Salem" is displayed on the page.

Traces to: UR-212

## **UR-213 — Multi-Town Document List**

**UR-213, MS — Multi-Town Document List.** As a user, I want to view documents from multiple towns in one combined list, so that I don't have to check each town separately.

**SRS-213.1, MS, Scope control display.** The system shall display a scope control with the options "Towns I follow" and "All towns" when a signed-in user opens the Documents page.

**Acceptance Criteria:** Given a signed-in user who follows zero towns, When the Documents page loads, Then the scope control is visible with the options "Towns I follow" and "All towns".

Traces to: UR-213

**SRS-213.2, MS, All-towns combined list.** The system shall list documents from every supported town in a single list when the user selects "All towns".

**Acceptance Criteria:** Given the user follows Town A, and 5 Town A documents and 3 Town B documents exist, When the user selects "All towns", Then one list shows all 8 documents.

Traces to: UR-213

**SRS-213.3, MS, Combined list ordering.** The system shall apply the sort order in SRS-209.1 across all towns, without grouping entries by town, when the "All towns" scope is selected.

**Acceptance Criteria:** Given a Town A document dated 09/10 and a Town B document dated 09/12 are both in scope, When "All towns" is selected, Then the Town B document appears above the Town A document.

Traces to: UR-213

**SRS-213.4, MS, Default scope.** The system shall select the "Towns I follow" scope each time the Documents page loads.

**Acceptance Criteria:** Given the user selected "All towns" and left the page, When the user returns to the Documents page, Then "Towns I follow" is selected.

Traces to: UR-213

## **UR-214 — Download Original PDF**

**UR-214, MS — Download Original PDF.** As a user, I want to download the original PDF of a document, so that I can keep a copy for my own records.

**SRS-214.1, MS, Download control.** The system shall display a "Download PDF" button when a document detail page opens.

**Acceptance Criteria:** Given any document's detail page, When the page opens, Then a "Download PDF" button is visible.

Traces to: UR-214

**SRS-214.2, MS, Original file download.** The system shall save a byte-identical copy of the retrieved PDF to the user's device when the user selects "Download PDF".

**Acceptance Criteria:** Given document X's detail page is open, When the user selects "Download PDF", Then the downloaded file's checksum matches the checksum of the retrieved file.

Traces to: UR-214

**SRS-214.3, MS, Download file name.** The system shall name each downloaded file using the pattern Town\_Body\_YYYY-MM-DD\_Type.pdf when the user selects "Download PDF".

**Acceptance Criteria:** Given a Salem City Council agenda for 09/14/2026, When the user downloads it, Then the file is named "Salem\_CityCouncil\_2026-09-14\_Agenda.pdf".

Traces to: UR-214

## **UR-215 — Retrieval Timestamp**

**UR-215, MS — Retrieval Timestamp.** As a user, I want to see how long ago a document was retrieved, so that I know how recent it is.

**SRS-215.1, MS, Relative retrieval time in list.** The system shall display each document's time since retrieval on its list entry, in minutes if under 60 minutes, in hours if under 24 hours, and in days otherwise, when the Documents page loads.

**Acceptance Criteria:** Given a document retrieved 3 hours and 10 minutes ago, When the Documents page loads, Then its entry shows "Retrieved 3 hours ago".

Traces to: UR-215

**SRS-215.2, MS, Exact retrieval time on detail page.** The system shall display the retrieval date and time in the format "Retrieved MM/DD/YYYY at h:mm AM/PM ET" when a document detail page opens.

**Acceptance Criteria:** Given a document retrieved on 09/20/2026 at 2:05 PM Eastern, When the user opens its detail page, Then "Retrieved 09/20/2026 at 2:05 PM ET" is displayed.

Traces to: UR-215

## **UR-216 — Search by Title**

**UR-216, MS — Search by Title.** As a user, I want to search my document list by title, so that I can find a specific document quickly.

**SRS-216.1, MS, Title search field.** The system shall display a search field labeled "Search by title" above the document list when the Documents page loads.

**Acceptance Criteria:** Given a signed-in user, When the Documents page loads, Then a search field labeled "Search by title" is visible above the list.

Traces to: UR-216

**SRS-216.2, MS, Title search within scope.** The system shall list only documents in the current scope whose titles contain the search term, ignoring letter case, when the user submits a title search.

**Acceptance Criteria:** Given the scope is "Towns I follow" (Town A) and both Town A and Town B have a document titled "Planning Board Agenda", When the user searches "planning", Then only the Town A document is displayed.

Traces to: UR-216

**SRS-216.3, MS, No results message.** The system shall display "No documents match your search." when a submitted title search matches zero documents.

**Acceptance Criteria:** Given no document title contains "zoning", When the user searches "zoning", Then "No documents match your search." is displayed.

Traces to: UR-216

**SRS-216.4, MS, Clear search.** The system shall list every document in the current scope when the user clears the title search field.

**Acceptance Criteria:** Given a search is showing 2 of 30 documents in scope, When the user clears the search field, Then all 30 documents are displayed.

Traces to: UR-216

## **UR-217 — Summarization Progress**

**UR-217, MS — Summarization Progress.** As a system administrator, I want to see how many documents have been summarized versus how many are still pending, so that I can track processing progress.

**SRS-217.1, MS, Completed summary count.** The system shall display the number of documents with summary status Complete when a system administrator opens the summarization progress page.

**Acceptance Criteria:** Given 40 documents have Complete summaries, When a system administrator opens the progress page, Then "Summarized: 40" is displayed.

Traces to: UR-217

**SRS-217.2, MS, Pending summary count.** The system shall display the number of documents with summary status Pending when a system administrator opens the summarization progress page.

**Acceptance Criteria:** Given 6 documents have Pending summaries, When a system administrator opens the progress page, Then "Pending: 6" is displayed.

Traces to: UR-217

**SRS-217.3, MS, Failed summary count.** The system shall display the number of documents with summary status Failed when a system administrator opens the summarization progress page.

**Acceptance Criteria:** Given 2 documents have Failed summaries, When a system administrator opens the progress page, Then "Failed: 2" is displayed.

Traces to: UR-217

**SRS-217.4, MS, Admin-only access.** The system shall deny access to the summarization progress page when an account without the system administrator role requests it.

**Acceptance Criteria:** Given a signed-in resident account, When that user navigates to the progress page's address, Then an access-denied message is shown and no counts are displayed.

Traces to: UR-217

## **UR-218 — PDF Load Failure Message**

**UR-218, MS — PDF Load Failure Message.** As a user, I want to be shown a clear message if a document's PDF fails to load, so that I know the issue is with the file, not my connection.

**SRS-218.1, MS, PDF load failure message.** The system shall display "This document's file could not be loaded. The problem is with the file, not your connection." in place of the PDF viewer when the stored PDF cannot be retrieved or rendered.

**Acceptance Criteria:** Given document X's stored file is corrupted, When the user opens its detail page, Then "This document's file could not be loaded. The problem is with the file, not your connection." is displayed where the PDF viewer would appear.

Traces to: UR-218

**SRS-218.2, MS, CivicClerk fallback link.** The system shall display an "Open on CivicClerk" link inside the PDF load failure message whenever that message is displayed.

**Acceptance Criteria:** Given the PDF load failure message is shown for document X, When the user selects "Open on CivicClerk", Then the CivicClerk page for document X opens.

Traces to: UR-218

## **UR-219 — Total Document Count**

**UR-219, MS — Total Document Count.** As a user, I want to see the total number of documents in my current view, so that I have a sense of how much government activity is happening in the towns I'm tracking.

**SRS-219.1, MS, Total document count.** The system shall display the number of documents in the current scope, in the format "N documents", above the document list when the Documents page loads.

**Acceptance Criteria:** Given the user follows Town A, which has 30 documents, and 50 documents exist across all towns, When the Documents page loads, Then "30 documents" is displayed, and When the user selects "All towns", Then "50 documents" is displayed.

Traces to: UR-219

**SRS-219.2, MS, Count during search.** The system shall display the count in the format "Showing M of N documents", where N is the document count for the current scope, while a title search is active.

**Acceptance Criteria:** Given 30 documents in the current scope and a title search matching 4 of them, When the search results display, Then "Showing 4 of 30 documents" is shown.

Traces to: UR-219

## **UR-220 — Retrieve Meetings**

**UR-220, MS — Retrieve meetings.** As a user, I want Civic Radar to collect each meeting's time, place, attendance details, and published files, so that meeting pages and alerts show accurate information.

**SRS-220.1, MS, Complete meeting retrieval.** The system shall read every page of a supported town's meeting list before recording that town's meeting collection as complete when a scheduled check runs.

**Acceptance Criteria:** Given Salem's meeting list spans 2 pages, When a scheduled check runs, Then meetings from both pages are stored and the meeting collection is recorded as Complete only after page 2 is read.

Traces to: UR-220

**SRS-220.2, MS, Meeting identity.** The system shall treat two retrieved meetings as the same meeting only when their town and source meeting identifier both match.

**Acceptance Criteria:** Given two Salem meetings share a title and date but have different source meeting identifiers, When both are retrieved, Then two separate meeting records exist.

Traces to: UR-220

**SRS-220.3, MS, Meeting details storage.** The system shall store each meeting's title, governing body, start time, location, online participation link, recording link, and official source link when the source provides them.

**Acceptance Criteria:** Given a Salem meeting whose source lists a title, governing body, start time, location, and official source link, When the meeting is retrieved, Then each of those values is stored with the meeting.

Traces to: UR-220

**SRS-220.4, MS, Missing meeting fields.** The system shall mark a meeting detail as not provided when the source omits that detail.

**Acceptance Criteria:** Given a Salem meeting has no online participation link, When the meeting is retrieved, Then its online participation link is marked as not provided.

Traces to: UR-220

**SRS-220.5, MS, Original start time storage.** The system shall store each meeting's start time exactly as the source provides it when the meeting is retrieved.

**Acceptance Criteria:** Given the source provides the start time "2026-09-24T19:00:00Z", When the meeting is retrieved, Then the stored original start time is exactly "2026-09-24T19:00:00Z".

Traces to: UR-220

**SRS-220.6, MS, Local start time.** The system shall calculate each meeting's local start time using its town's configured meeting time zone (SRS-104.6) when the meeting is retrieved.

**Acceptance Criteria:** Given Salem's configured meeting time zone is America/New\_York and the source lists 7:00 PM on 09/24/2026, When the meeting is retrieved, Then its local start time is 7:00 PM EDT on 09/24/2026.

Traces to: UR-220

**SRS-220.7, MS, Meeting–document link.** The system shall link each retrieved document to the meeting the source lists it under when the meeting is retrieved.

**Acceptance Criteria:** Given Salem meeting 1192 lists Agenda file 1166 and Agenda Packet file 1167, When the meeting is retrieved, Then both documents are linked to meeting 1192\.

Traces to: UR-220

**SRS-220.8, MS, Meetings without documents.** The system shall keep a retrieved meeting's record when the source lists no documents for that meeting.

**Acceptance Criteria:** Given a future meeting with zero published documents, When it is retrieved, Then its meeting record exists with zero linked documents.

Traces to: UR-220

**SRS-220.9, MS, Agenda item retrieval.** The system shall retrieve a meeting's agenda items when its town's source has been verified to provide agenda items.

**Acceptance Criteria:**

•       Given agenda items have been verified for Town A's source and a Town A meeting has 5 agenda items, When the meeting is retrieved, Then 5 agenda items are stored and linked to it.

•       Given agenda items have not been verified for Salem's source, When a Salem meeting is retrieved, Then no agenda-item retrieval runs.

Traces to: UR-220

**SRS-220.10, MS, Recording retrieval.** The system shall retrieve a meeting's recording links when its town's source has been verified to provide recordings.

**Acceptance Criteria:**

•       Given recordings have been verified for Town A's source and a Town A meeting has a recording link, When the meeting is retrieved, Then the recording link is stored with the meeting.

•       Given recordings have not been verified for Salem's source, When a Salem meeting is retrieved, Then no recording retrieval runs.

Traces to: UR-220

## **UR-221 — Keep Meeting Data Current**

**UR-221, MS — Keep meeting data current.** As a user, I want previously retrieved meetings refreshed, so that time changes, cancellations, new minutes, and new recordings are caught.

**SRS-221.1, MS, Tracked meeting refresh.** The system shall re-read every tracked meeting of a supported town during each scheduled check of that town.

**Acceptance Criteria:** Given meeting 1192 took place last week and had no minutes, When minutes are published and the next scheduled check runs, Then the minutes file is retrieved and linked to meeting 1192\.

Traces to: UR-221

**SRS-221.2, MS, Explicit cancellations only.** The system shall record a meeting as canceled only when the source explicitly marks that meeting as canceled.

**Acceptance Criteria:**

•       Given the source marks meeting 1192 as canceled, When the next check completes, Then meeting 1192 is recorded as canceled.

•       Given meeting 1192 is missing from a successful check but not marked canceled, When the check ends, Then meeting 1192 is not recorded as canceled.

Traces to: UR-221

**SRS-221.3, MS, No removal on failed check.** The system shall keep a meeting's existing record unchanged when that meeting is missing from a check that was not successful.

**Acceptance Criteria:** Given page 2 of Salem's meeting list fails to load, When the check ends, Then every existing meeting that would appear on page 2 keeps its record unchanged.

Traces to: UR-221

## **UR-222 — Report Source Check Status**

**UR-222, MS — Report source check status.** As a user, I want to know whether the latest check of each town worked, so that I don't mistake a failed check for no news.

**SRS-222.1, MS, Check time record.** The system shall record the end time of each scheduled check for each supported town when the check ends.

**Acceptance Criteria:** Given a scheduled Salem check ends at 2:00 PM, When the check ends, Then Salem's check record shows an end time of 2:00 PM.

Traces to: UR-222

**SRS-222.2, MS, Collection result record.** The system shall record each collection's result (Complete, Failed, or Unsupported) for each supported town when a scheduled check ends.

**Acceptance Criteria:** Given Salem's meetings and documents were read in full and agenda items are unsupported, When the check ends, Then the check record shows meetings Complete, documents Complete, and agenda items Unsupported.

Traces to: UR-222

**SRS-222.3, MS, Partial read recorded as failed.** The system shall record a collection as Failed when any page of that collection could not be read during a scheduled check.

**Acceptance Criteria:** Given page 2 of Salem's document collection times out, When the check ends, Then the document collection is recorded as Failed.

Traces to: UR-222

 

# **4\. Officials & Contact Extractions**

## **UR-301 — Request Contact Extraction**

**UR-301, AO — Request contact extraction.** As a user, I want to request officials and contact information from a specific government document, so that I do not have to search through the entire document myself.

**SRS-301.1, AO, Document selection.** The system shall mark a retrieved document as selected for extraction when a signed-in user selects it on the extraction page.

**Acceptance Criteria:** Given a signed-in user is on the extraction page, When the user selects document X, Then document X is marked as selected.

Traces to: UR-301

**SRS-301.2, AO, Selected document preview.** The system shall display the selected document's title when a user selects a document for extraction.

**Acceptance Criteria:** Given a signed-in user is on the extraction page, When the user selects document X, Then document X's title is displayed.

Traces to: UR-301

**SRS-301.3, AO, No-selection block.** The system shall disable the extraction request control while no document is selected.

**Acceptance Criteria:** Given no document is selected, When the extraction page is displayed, Then the extraction request control is disabled.

Traces to: UR-301

**SRS-301.4, AO, Extraction request.** The system shall create one extraction request linked to the signed-in user when the user confirms extraction of the selected document.

**Acceptance Criteria:** Given document X is selected, When the user confirms extraction, Then exactly one extraction request for document X exists and it is linked to the user's account.

Traces to: UR-301

**SRS-301.5, AO, File format validation.** The system shall reject an extraction request when the selected document's file is not a PDF.

**Acceptance Criteria:** Given the selected document's file is not a PDF, When the user requests extraction, Then no extraction request is created.

Traces to: UR-301

**SRS-301.6, AO, Unsupported format message.** The system shall display "This file can't be extracted. Only PDF documents are supported." when an extraction request is rejected under SRS-301.5.

**Acceptance Criteria:** Given an extraction request is rejected under SRS-301.5, When the rejection occurs, Then "This file can't be extracted. Only PDF documents are supported." is displayed.

Traces to: UR-301

## **UR-302 — View Extracted Details**

**UR-302, AO — View extracted details.** As a user, I want to see each extracted official’s name, title, role, and available contact information, so that I can understand who they are and how to reach them.

**SRS-302.1, AO, Extracted official details.** The system shall display each extracted official's name, title, role, email address, and telephone number, each next to its field name, when the user opens a completed extraction.

**Acceptance Criteria:** Given an extraction found an official with a name, title, role, email address, and telephone number, When the user opens the extraction, Then all five values are displayed, each next to its field name.

Traces to: UR-302

**SRS-302.2, AO, One entry per official.** The system shall display each extracted official as a separate entry when the user opens a completed extraction.

**Acceptance Criteria:** Given an extraction found three officials, When the user opens the extraction, Then three separate official entries are displayed.

Traces to: UR-302

**SRS-302.3, AO, Result availability.** The system shall display an extraction's results when the extraction's status changes to Completed.

**Acceptance Criteria:** Given the user is viewing an extraction with status Processing, When the status changes to Completed, Then the extracted officials are displayed without the user starting another extraction.

Traces to: UR-302

**SRS-302.4, AO, No officials found message.** The system shall display "No officials could be extracted from this document." when a completed extraction contains zero officials.

**Acceptance Criteria:** Given a completed extraction found zero officials, When the user opens the extraction, Then "No officials could be extracted from this document." is displayed.

Traces to: UR-302

## **UR-303 — Identify the Source Document**

**UR-303, AO — Identify the source document.** As a user, I want each extraction result linked to the document it came from, so that I can verify the information against the original source.

**SRS-303.1, AO, Source document name.** The system shall display the source document's title whenever an extraction result is displayed.

**Acceptance Criteria:** Given an extraction of document X, When the user opens the extraction result, Then document X's title is displayed.

Traces to: UR-303

**SRS-303.2, AO, Source document link.** The system shall open the source document's detail page (SRS-203.1) when the user selects the source link on an extraction result.

**Acceptance Criteria:** Given an extraction result for document X is open, When the user selects the source link, Then document X's detail page opens.

Traces to: UR-303

**SRS-303.3, AO, Unavailable source message.** The system shall display "The source document is no longer available." when the user selects the source link and the source document cannot be found.

**Acceptance Criteria:** Given document X has been removed from Civic Radar, When the user selects the source link on its extraction result, Then "The source document is no longer available." is displayed.

Traces to: UR-303

**SRS-303.4, AO, Extraction timestamp.** The system shall display the date and time the extraction was performed whenever an extraction result is displayed.

**Acceptance Criteria:** Given an extraction was performed on 09/20/2026 at 2:05 PM, When the user opens it on 09/23/2026, Then "09/20/2026 2:05 PM" is displayed as the extraction time.

Traces to: UR-303

## **UR-304 — View Saved Extraction**

**UR-304, AO — View saved extraction.** As a user, I want to access my previously saved extraction results, so that I can return to the information without processing the document again.

**SRS-304.1, AO, Saved extraction list.** The system shall list the signed-in user's saved extractions, with each one's source document title and extraction date, when the user opens the Saved Extractions page.

**Acceptance Criteria:** Given the user has two saved extractions, When the user opens the Saved Extractions page, Then both are listed, each with its source document title and extraction date.

Traces to: UR-304

**SRS-304.2, AO, Open saved extraction.** The system shall display a saved extraction's stored results, without running a new extraction, when the user opens it from the Saved Extractions page.

**Acceptance Criteria:** Given a saved extraction of document X, When the user opens it from the Saved Extractions page, Then its stored results are displayed and no new extraction request is created.

Traces to: UR-304

**SRS-304.3, AO, Saved extraction retention.** The system shall keep a saved extraction, across sign-out and sign-in, until the user deletes it.

**Acceptance Criteria:** Given the user has a saved extraction, When the user signs out and signs back in, Then the extraction is still listed on the Saved Extractions page.

Traces to: UR-304

## **UR-305 — Delete Saved Extraction**

**UR-305, AO — Delete saved extraction.** As a user, I want to delete my saved extraction records, so that I can remove information I no longer need.

**SRS-305.1, AO, Delete control.** The system shall display a Delete control on each extraction when the user opens the Saved Extractions page.

**Acceptance Criteria:** Given the user has two saved extractions, When the user opens the Saved Extractions page, Then each extraction shows a Delete control.

Traces to: UR-305

**SRS-305.2, AO, Deletion confirmation.** The system shall ask the user to confirm deletion, naming the extraction's source document, when the user selects Delete.

**Acceptance Criteria:** Given a saved extraction of document X, When the user selects its Delete control, Then a confirmation naming document X is displayed.

Traces to: UR-305

**SRS-305.3, AO, Deletion cancel.** The system shall keep the extraction unchanged when the user cancels the deletion confirmation.

**Acceptance Criteria:** Given the deletion confirmation is displayed, When the user cancels, Then the extraction is still listed.

Traces to: UR-305

**SRS-305.4, AO, Permanent deletion.** The system shall permanently delete the extraction when the user confirms deletion.

**Acceptance Criteria:** Given the deletion confirmation is displayed, When the user confirms, Then the extraction no longer appears in the list and cannot be opened.

Traces to: UR-305

**SRS-305.5, AO, Deletion success message.** The system shall display "Extraction deleted." when a deletion succeeds.

**Acceptance Criteria:** Given the user confirms deletion, When the deletion succeeds, Then "Extraction deleted." is displayed.

Traces to: UR-305

**SRS-305.6, AO, Deletion failure message.** The system shall display "The extraction could not be deleted. Please try again." when a deletion fails.

**Acceptance Criteria:** Given the user confirms deletion, When the deletion fails, Then "The extraction could not be deleted. Please try again." is displayed and the extraction is still listed.

Traces to: UR-305

## **UR-306 — Extraction Progress**

**UR-306, AO — Extraction progress.** As a user, I want to know when contact extraction is processing, so that I understand why the results are not immediately available.

**SRS-306.1, AO, Extraction status display.** The system shall display the extraction's current status (Queued, Processing, Completed, or Failed) while the user views an extraction request.

**Acceptance Criteria:** Given an extraction request with status Processing, When the user views the request, Then "Processing" is displayed as its status.

Traces to: UR-306

**SRS-306.2, AO, Progress indicator.** The system shall display a progress indicator while an extraction's status is Queued or Processing.

**Acceptance Criteria:**

•       Given an extraction's status is Queued, When the user views the request, Then a progress indicator is visible.

•       Given an extraction's status is Completed, When the user views the request, Then no progress indicator is visible.

Traces to: UR-306

**SRS-306.3, AO, Duplicate submission prevention.** The system shall disable the extraction request control for a document while that document's extraction status is Queued or Processing.

**Acceptance Criteria:** Given document X's extraction status is Processing, When the user views the extraction page with document X selected, Then the extraction request control is disabled.

Traces to: UR-306

## **UR-307 — Extraction Failure Message**

**UR-307, AO — Extraction failure message.** As a user, I want to receive a clear message if contact information cannot be extracted, so that I know whether to try again or review the document manually.

**SRS-307.1, AO, Failure message.** The system shall display "Extraction was not completed." when an extraction's status changes to Failed.

**Acceptance Criteria:** Given the user is viewing an extraction, When its status changes to Failed, Then "Extraction was not completed." is displayed.

Traces to: UR-307

**SRS-307.2, AO, Known failure cause.** The system shall display the cause of failure when a failed extraction's cause is an unreadable file, a file over the size limit, or a missing source file.

**Acceptance Criteria:** Given an extraction failed because the file could not be read, When the failure message is displayed, Then it states that the file could not be read.

Traces to: UR-307

**SRS-307.3, AO, Unknown failure cause.** The system shall display "Something went wrong. Please try again." when a failed extraction's cause is not one of the known causes in SRS-307.2.

**Acceptance Criteria:** Given an extraction failed for a cause not listed in SRS-307.2, When the failure message is displayed, Then "Something went wrong. Please try again." is displayed.

Traces to: UR-307

**SRS-307.4, AO, No technical details.** The system shall exclude error codes and stack traces from every extraction failure message shown to users.

**Acceptance Criteria:** Given an extraction failed because of a server exception, When the failure message is displayed, Then it contains no error code and no stack trace.

Traces to: UR-307

**SRS-307.5, AO, Retry control.** The system shall display a Retry control when an extraction's status changes to Failed.

**Acceptance Criteria:** Given the user is viewing an extraction, When its status changes to Failed, Then a Retry control is displayed.

Traces to: UR-307

**SRS-307.6, AO, Retry attempt.** The system shall create a new extraction attempt for the same document when the user selects Retry.

**Acceptance Criteria:** Given an extraction of document X has status Failed, When the user selects Retry, Then a new extraction attempt for document X is created with status Queued and the earlier attempt remains Failed.

Traces to: UR-307

## **UR-308 — Missing Information Indicator**

**UR-308, AO — Missing information indicator.** As a user, I want unavailable details to be clearly labeled, so that I do not mistake missing information for complete contact information.

**SRS-308.1, AO, Not found label.** The system shall display "Not found" in place of a value for each expected field that the extraction could not find in the source document.

**Acceptance Criteria:** Given an extraction found an official's name but no telephone number, When the user opens the extraction, Then the telephone number field shows "Not found".

Traces to: UR-308

**SRS-308.2, AO, Partial extraction display.** The system shall display every field that was found when a completed extraction is missing one or more expected fields.

**Acceptance Criteria:** Given an extraction found an official's name, title, and email address but not the role or telephone number, When the user opens the extraction, Then the name, title, and email address are displayed.

Traces to: UR-308

## **UR-309 — Search Extracted Contacts**

**UR-309, AO — Search extracted contacts.** As a user, I want to search my extracted records by an official’s name, title, or role, so that I can quickly find the person I need.

**SRS-309.1, AO, Contact search.** The system shall list the user's saved contacts whose name, title, or role contains the query text, ignoring letter case, when the user submits a contact search.

**Acceptance Criteria:** Given saved contacts "Jane Doe, City Clerk" and "John Roe, Planner", When the user searches "clerk", Then only Jane Doe is listed.

Traces to: UR-309

**SRS-309.2, AO, Contact search no results.** The system shall display "No contacts match your search." when a submitted contact search matches zero contacts.

**Acceptance Criteria:** Given no saved contact's name, title, or role contains "treasurer", When the user searches "treasurer", Then "No contacts match your search." is displayed.

Traces to: UR-309

**SRS-309.3, AO, Search result source.** The system shall display the source document title with each contact search result when contact search results are displayed.

**Acceptance Criteria:** Given a contact search returns Jane Doe from document X, When the results are displayed, Then document X's title is shown with Jane Doe.

Traces to: UR-309

**SRS-309.4, AO, Open search result.** The system shall open the extraction that contains a contact when the user selects that contact in the search results.

**Acceptance Criteria:** Given a contact search result for Jane Doe from extraction E, When the user selects Jane Doe, Then extraction E opens.

Traces to: UR-309

**SRS-309.5, AO, Clear contact search.** The system shall list all of the user's saved contacts when the user clears the contact search field.

**Acceptance Criteria:** Given a search is showing 1 of 8 saved contacts, When the user clears the search field, Then all 8 contacts are listed.

Traces to: UR-309

## **UR-310 — Protect Personal Extraction Records**

**UR-310, AO — Protect personal extraction records.** As a user, I want only my account to access and delete my saved extraction records, so that my saved information remains private.

**SRS-310.1, AO, Sign-in required.** The system shall redirect a visitor who is not signed in to the sign-in page when the visitor requests any saved extraction page.

**Acceptance Criteria:** Given a visitor is not signed in, When the visitor requests the Saved Extractions page address, Then the visitor is redirected to the sign-in page.

Traces to: UR-310

**SRS-310.2, AO, Ownership check.** The system shall deny a request to view, search, or delete an extraction when the signed-in user does not own that extraction.

**Acceptance Criteria:** Given user A owns extraction 42, When user B requests extraction 42 by changing the page address, Then the system returns an access-denied response.

Traces to: UR-310

**SRS-310.3, AO, Contact details kept out of logs.** The system shall exclude extracted contact details from application logs whenever it writes a log entry.

**Acceptance Criteria:** Given an extraction containing an official's email address is processed, When the application logs for that request are reviewed, Then the email address does not appear in any log entry.

Traces to: UR-310

**SRS-310.4, AO, Access after sign-out.** The system shall deny requests for saved extractions made with a session after the user has signed out of that session.

**Acceptance Criteria:** Given the user signed out of a session, When a request for saved extractions is sent with that session, Then the request is denied.

Traces to: UR-310

**SRS-310.5, AO, Access after session expiry.** The system shall require the user to sign in again before showing saved extractions when the user's session has expired.

**Acceptance Criteria:** Given the user's session has expired, When the user opens the Saved Extractions page, Then the sign-in page is shown before any extraction is displayed.

Traces to: UR-310

## **UR-311 — Shared Officials List**

 **SRS-311.1 (UR-311) — View shared officials list.**The system shall display a single shared list of officials extracted from documents for the pilot municipality.  
Acceptance criteria:

* Each official appears once in the list.  
* Each entry shows name, title, role, and available contact information.  
* Details that aren't available are labeled as unavailable (consistent with UR-308).  
* Each entry links to at least one source document (consistent with UR-303).

**SRS-311.2 (UR-311) — Merge repeated officials.** When an extraction finds an official already in the shared list, the system shall update that entry instead of creating a second one.  
Acceptance criteria:

* A name match with the same body creates no duplicate entry.  
* The entry shows the most recent title and contact details found.  
* The entry keeps a link to every source document it came from.

# **5\. Interest Matching, Alerts & Digest**

## **UR-401 — See Meetings Relevant to Me**

**UR-401, EG — See meetings relevant to me.** As a resident, I want to add or remove followed towns, have my choices remembered, and see meetings matching those towns and my saved topics, so that I can find relevant information without checking every meeting.

**SRS-401.1, EG, Topic-and-town matching.** The system shall include a meeting in a resident's matching result when the meeting belongs to one of the resident's followed towns and has at least one of the resident's followed topic tags.

**Acceptance Criteria:** Given a resident follows Housing and Towns A and B, When housing meetings from Towns A, B, and C are evaluated, Then only the Town A and Town B meetings are in the matching result.

Traces to: UR-401

**SRS-401.2, EG, Changed preferences applied.** The system shall use the resident's most recently saved towns and topics the next time it evaluates matches for that resident.

**Acceptance Criteria:** Given a resident removes Town A and saves, When matching next runs, Then Town A meetings no longer qualify through town matching, and a directly followed Town A meeting remains relevant.

Traces to: UR-401

**SRS-401.3, EG, Complete empty result.** The system shall return a matching result marked Complete with zero meetings when every required check was successful and no meeting matches.

**Acceptance Criteria:** Given every required check was successful and zero meetings match, When the matching result is returned, Then it is marked Complete and contains zero meetings.

Traces to: UR-401

**SRS-401.4, EG, Topic tagging.** The system shall assign topic tags from the platform topic catalog to a meeting when new or changed agenda text for that meeting becomes available.

**Acceptance Criteria:** Given an agenda item in a newly published agenda discusses housing, When the agenda text becomes available, Then the item's parent meeting receives the Housing tag.

Traces to: UR-401

**SRS-401.5, EG, Matching reason.** The system shall include the matched town, the matched topic tags, and the agenda text that produced each tag with every meeting when it returns a matching result.

**Acceptance Criteria:** Given agenda text caused a Housing match for a Salem meeting, When the matching result is returned, Then that meeting's entry includes Salem, Housing, and the agenda passage that produced the tag.

Traces to: UR-401

**SRS-401.6, EG, Save followed towns.** The system shall store the resident's selected towns as their followed towns, replacing the previous selection, when the resident saves town preferences.

**Acceptance Criteria:**

•       Given the resident selects Towns A and B and saves, When the resident signs out and back in, Then both towns remain followed.

•       Given Towns A and B are followed, When the resident deselects Town A and saves, Then only Town B is followed.

Traces to: UR-401

**SRS-401.7, EG, Town choices display.** The system shall display every supported town, with the resident's followed towns marked, when the resident opens town preferences.

**Acceptance Criteria:** Given Town A is followed and Town B is supported but not followed, When the resident opens town preferences, Then both towns are listed and only Town A is marked.

Traces to: UR-401

**SRS-401.8, EG, Setup message.** The system shall display a setup message naming the missing selection (towns, topics, or both) when a resident with no followed towns or no followed topics opens the dashboard.

**Acceptance Criteria:** Given a resident follows two topics and no towns, When the resident opens the dashboard, Then a setup message naming towns as the missing selection is displayed.

Traces to: UR-401

**SRS-401.10, EG, Unavailable classification.** The system shall mark a meeting's topic classification as Unavailable when the meeting has no agenda text to classify.

**Acceptance Criteria:** Given a meeting has a generic title and no agenda text, When classification runs, Then the meeting's topic classification is Unavailable rather than a confirmed non-match.

Traces to: UR-401

**SRS-401.11, EG, Incomplete matching result.** The system shall return a matching result marked Incomplete, listing each town whose most recent check was not successful, when any required check was not successful.

**Acceptance Criteria:** Given Brookline's most recent check failed and Salem's succeeded, When the matching result is returned, Then it is marked Incomplete, lists Brookline, and still includes Salem's matching meetings.

Traces to: UR-401

## **UR-402 — Get Notified Before a Meeting**

**UR-402, EG — Get notified before a meeting.** As a resident, I want to be notified about upcoming meetings relevant to me and changes to their published details, so that I have time to plan how to participate.

**SRS-402.1, EG, Upcoming meeting alert.** The system shall create one in-app upcoming-meeting alert for a resident when a meeting with a future local start time first becomes relevant to that resident.

**Acceptance Criteria:**

•       Given a relevant meeting starts Thursday, When it first becomes relevant to the resident on Monday, Then one upcoming-meeting alert is created for that resident.

•       Given a meeting's start time has already passed, When it first becomes relevant, Then no upcoming-meeting alert is created.

Traces to: UR-402

**SRS-402.2, EG, Upcoming alert contents.** The system shall include the meeting title, town, governing body, local start time with time zone, location, online participation link, official source link, and meeting details link when it creates an upcoming-meeting alert.

**Acceptance Criteria:** Given a Salem City Council meeting with every listed detail published, When its upcoming-meeting alert is created, Then the alert contains the title, town, governing body, local start time with time zone, location, online participation link, official source link, and meeting details link.

Traces to: UR-402

**SRS-402.3, EG, Schedule change alert.** The system shall create a change alert for each resident to whom a meeting is relevant when a successful check detects a change to that meeting's start time, location, online participation link, or cancellation status.

**Acceptance Criteria:** Given a resident was notified about a meeting set for Tuesday, When a successful check finds the meeting moved to Thursday, Then that resident receives one change alert.

Traces to: UR-402

**SRS-402.4, EG, No alert without a start time.** The system shall not create an upcoming-meeting alert for a meeting that has no local start time.

**Acceptance Criteria:** Given a relevant meeting has no local start time, When alerts are evaluated, Then no upcoming-meeting alert is created for it.

Traces to: UR-402

**SRS-402.6, EG, Missing alert details.** The system shall show "Not provided by the source" in an upcoming-meeting alert for each listed detail the source did not provide.

**Acceptance Criteria:** Given a meeting's location is published but no online participation link is, When its upcoming-meeting alert is created, Then the online participation link shows "Not provided by the source".

Traces to: UR-402

**SRS-402.7, EG, Change alert contents.** The system shall include the previous value and the new value of the changed detail when it creates a change alert.

**Acceptance Criteria:** Given a meeting moved from Tuesday to Thursday, When its change alert is created, Then the alert shows Tuesday as the previous value and Thursday as the new value.

Traces to: UR-402

## **UR-403 — Get Notified When Meeting Records Are Available**

**UR-403, EG — Get notified when meeting records are available.** As a resident, I want an alert when published minutes or a supported recording becomes available for a relevant meeting, so that I know when I can review the official record.

**SRS-403.1, EG, Meeting record alert.** The system shall create an in-app alert for each resident to whom a meeting is relevant when a successful check finds newly published minutes or a new recording for that meeting after its start time has passed.

**Acceptance Criteria:**

•       Given minutes were absent in the previous successful check of a past relevant meeting, When a successful check finds a minutes file for that meeting, Then an in-app alert identifies the new minutes.

•       Given a minutes file was already announced, When a later check finds the same file, Then no new alert is created.

Traces to: UR-403

**SRS-403.2, EG, Meeting record alert contents.** The system shall include the meeting title, meeting date, material title, material type, summary status, official material link, and meeting details link when it creates a meeting-record alert.

**Acceptance Criteria:** Given a minutes PDF becomes available while its summary is Pending, When the meeting-record alert is created, Then it contains the meeting title, meeting date, material title, material type Minutes, summary status Pending, the PDF link, and the meeting details link.

Traces to: UR-403

## **UR-404 — Follow a Specific Meeting**

**UR-404, EG — Follow a specific meeting.** As a resident, I want to follow or unfollow a specific meeting and receive updates about its published documents and any supported agenda items or recordings, so that I can keep up with that meeting in one place.

**SRS-404.1, EG, Follow a meeting.** The system shall add a meeting to the resident's followed meetings when the resident selects Follow on that meeting.

**Acceptance Criteria:** Given the resident selects Follow on meeting 1192, When the resident signs out and back in, Then meeting 1192 is still followed and no other meeting with a similar title has been added.

Traces to: UR-404

**SRS-404.2, EG, Unfollow a meeting.** The system shall remove a meeting from the resident's followed meetings when the resident selects Unfollow on that meeting.

**Acceptance Criteria:** Given meeting 1192 is followed and does not match the resident's topics and towns, When the resident selects Unfollow, Then later updates to meeting 1192 create no alerts for that resident.

Traces to: UR-404

**SRS-404.3, EG, Meeting material update.** The system shall create an in-app update for each resident to whom a meeting is relevant when a successful check detects a new document, a new agenda item, or a new recording for that meeting.

**Acceptance Criteria:** Given a new agenda item and attachment are published for a followed meeting, When the next successful check completes, Then the resident receives an in-app update identifying the new material.

Traces to: UR-404

**SRS-404.5, EG, Comparison baseline update.** The system shall save a town's latest meeting and document values as its comparison baseline when a check of that town is successful.

**Acceptance Criteria:** Given a successful check finds a meeting moved from Tuesday to Thursday, When processing completes, Then Thursday is the meeting's baseline value for the next comparison.

Traces to: UR-404

**SRS-404.6, EG, Update record.** The system shall store one update record containing the meeting, the changed item, the detection time, the update type, the previous value, and the new value when a monitored change is detected.

**Acceptance Criteria:** Given one schedule change affects ten residents, When processing completes, Then exactly one update record exists for that change, containing the meeting, changed item, detection time, update type, previous value, and new value.

Traces to: UR-404

**SRS-404.7, EG, First baseline.** The system shall create an initial comparison baseline for a meeting when the meeting is retrieved for the first time.

**Acceptance Criteria:** Given a meeting is retrieved for the first time, When retrieval completes, Then a comparison baseline exists holding that meeting's current values.

Traces to: UR-404

**SRS-404.9, EG, Baseline kept on failed check.** The system shall keep the previous comparison baseline when a check of that town is not successful.

**Acceptance Criteria:** Given a meeting's baseline start time is Tuesday, When a check that is not successful returns Thursday, Then the baseline start time remains Tuesday.

Traces to: UR-404

**SRS-404.10, EG, No alerts for first retrieval.** The system shall not create new-publication alerts for documents found during a meeting's first retrieval.

**Acceptance Criteria:** Given a meeting's first retrieval includes an existing agenda and minutes, When retrieval completes, Then no new-publication alerts are created for those documents.

Traces to: UR-404

## **UR-405 — Avoid Duplicate Alerts**

**UR-405, EG — Avoid duplicate alerts.** As a resident, I want to avoid receiving repeated alerts about the same meeting update, so that I can focus on new information without unnecessary interruptions.

**SRS-405.1, EG, One in-app alert per update.** The system shall keep only one in-app alert per resident per meeting update when that update qualifies for the resident more than once.

**Acceptance Criteria:** Given a meeting update matches a resident's topic and a meeting the resident follows directly, When both matches are evaluated, Then exactly one in-app alert exists for that resident and update.

Traces to: UR-405

**SRS-405.2, EG, No repeat email.** The system shall not submit an email for a resident and meeting update when the email service's acceptance of that email is already recorded.

**Acceptance Criteria:** Given the email service's acceptance of an individual email for a resident and update is recorded, When the delivery job runs again, Then no second email is submitted.

Traces to: UR-405

**SRS-405.3, EG, Unchanged records ignored.** The system shall not create an update record when a successful check returns the same monitored values as the saved comparison baseline.

**Acceptance Criteria:** Given a successful check returns values identical to the saved baseline except for retrieval time and download-link parameters, When values are compared, Then no update record is created.

Traces to: UR-405

**SRS-405.4, EG, Unresolved email status.** The system shall mark an email submission as Unresolved when the email service returns neither an acceptance nor a rejection.

**Acceptance Criteria:** Given an email submission times out with no response from the email service, When the delivery job ends, Then that submission is marked Unresolved.

Traces to: UR-405

**SRS-405.5, EG, No automatic resend.** The system shall not automatically resend an email whose submission is marked Unresolved.

**Acceptance Criteria:** Given an email submission is marked Unresolved, When the delivery job runs again, Then that email is not resent automatically.

Traces to: UR-405

## **UR-406 — Choose When I Receive Emails**

**UR-406, EG — Choose when I receive emails.** As a resident, I want to choose whether upcoming meeting notices, meeting material updates, and available minutes or recordings reach me through individual emails or a weekly digest, so that I can stay informed without flooding my inbox.

**SRS-406.1, EG, Email choice per type.** The system shall store the resident's delivery choice (Individual, Weekly digest, or Both) for each of the three email types when the resident saves email preferences.

**Acceptance Criteria:** Given upcoming notices are set to Individual, material updates to Weekly digest, and minutes and recordings to Both, When the resident saves and reopens email preferences, Then all three choices are shown as saved.

Traces to: UR-406

**SRS-406.2, EG, Individual email submission.** The system shall submit an individual email for an alert when the alert's email type is set to Individual or Both and the resident's email delivery is active.

**Acceptance Criteria:**

•       Given minutes and recordings are set to Both and email is active, When a minutes alert is created, Then one individual email is submitted.

•       Given minutes and recordings are set to Weekly digest, When a minutes alert is created, Then no individual email is submitted.

Traces to: UR-406

**SRS-406.3, EG, Digest content by choice.** The system shall include an update in the weekly digest only when the update's email type is set to Weekly digest or Both.

**Acceptance Criteria:** Given upcoming notices are set to Individual and material updates to Weekly digest, When the digest is prepared, Then the material updates are included and the upcoming notices are not included through those choices.

Traces to: UR-406

## **UR-407 — Pause or Stop Emails**

**UR-407, EG — Pause or stop emails.** As a resident, I want to pause or turn off emails while still viewing meeting updates in the app, so that I can stay informed on my own schedule.

**SRS-407.1, EG, Pause emails.** The system shall stop all email submissions to a resident until the date and time the resident selects when the resident pauses email.

**Acceptance Criteria:** Given the resident pauses email until Friday at 6:00 PM, When an individual email is due Thursday, Then no email is submitted.

Traces to: UR-407

**SRS-407.2, EG, Turn off emails.** The system shall stop all email submissions to a resident, until the resident turns email back on, when the resident turns email off.

**Acceptance Criteria:** Given email is turned off, When a new meeting update appears or a digest is due, Then no email is submitted.

Traces to: UR-407

**SRS-407.3, EG, Resume with saved choices.** The system shall apply the resident's saved email-type choices when a pause ends or the resident turns email back on.

**Acceptance Criteria:** Given material updates were set to Weekly digest before a pause, When the pause ends, Then material updates are still delivered through the weekly digest.

Traces to: UR-407

**SRS-407.4, EG, In-app alerts during suppression.** The system shall continue creating in-app alerts for a resident while that resident's email is paused or off.

**Acceptance Criteria:** Given email is off, When a relevant meeting gains a document, Then the resident's alert list includes the new update.

Traces to: UR-407

**SRS-407.5, EG, No backlog after resume.** The system shall not send individual emails for alerts created while the resident's email was paused or off.

**Acceptance Criteria:** Given email is paused and three alerts are created during the pause, When the pause ends, Then no individual emails are sent for those three alerts.

Traces to: UR-407

## **UR-408 — Get a Weekly Meeting Summary**

**UR-408, EG — Get a weekly meeting summary.** As a resident, I want one weekly email in my chosen time zone summarizing relevant meetings across my followed towns and meetings I follow directly, with a clear message when no eligible updates were found or the check could not be completed, so that I can review upcoming meetings and new materials without checking the site every day.

**SRS-408.1, EG, Weekly digest delivery.** The system shall submit one combined digest email to a resident at 6:00 p.m. every Sunday in the resident's digest time zone when the resident's email is active and at least one email type is set to Weekly digest or Both.

**Acceptance Criteria:** Given a resident follows meetings in two towns, has email active, and has one email type set to Weekly digest, When Sunday at 6:00 PM occurs in the resident's digest time zone, Then one combined digest is submitted rather than one per town.

Traces to: UR-408

**SRS-408.2, EG, Digest update selection.** The system shall include the resident's meeting updates first detected during the reporting period when it prepares that resident's digest.

**Acceptance Criteria:** Given a new agenda item was first detected during the reporting period and an unchanged document was detected in an earlier period, When the digest is prepared, Then only the new agenda item is included as an update.

Traces to: UR-408

**SRS-408.3, EG, Upcoming meetings first.** The system shall list upcoming meetings at the top of the digest, ordered from nearest to latest start time, when a digest contains upcoming meetings.

**Acceptance Criteria:** Given a digest contains meetings on Tuesday and Friday and two material updates, When the digest is prepared, Then the Tuesday meeting is listed first, the Friday meeting second, and both appear above the material updates.

Traces to: UR-408

**SRS-408.4, EG, Digest item details.** The system shall show the meeting title, town, update type, summary or change description, local start time, meeting link, and material link for each item when it prepares a digest.

**Acceptance Criteria:** Given an attachment is new but its summary is Pending, When the digest is prepared, Then its item shows the meeting title, town, update type, the Pending label in place of a summary, the start time, and both links.

Traces to: UR-408

**SRS-408.5, EG, Empty week message.** The system shall include "No matching meeting updates were found for your weekly digest this week" in the digest when every required check was successful and no item qualifies.

**Acceptance Criteria:** Given every required check was successful, email is active, and one email type is set to Weekly digest, When no item qualifies, Then the digest contains "No matching meeting updates were found for your weekly digest this week" and no older content.

Traces to: UR-408

**SRS-408.6, EG, Incomplete week label.** The system shall label the digest "Weekly check incomplete; updates may be missing" when any required check during the reporting period was not successful.

**Acceptance Criteria:** Given one followed town's check failed during the reporting period, When the digest is prepared, Then it carries the label "Weekly check incomplete; updates may be missing".

Traces to: UR-408

**SRS-408.7, EG, Save digest time zone.** The system shall store a valid named time zone as the resident's digest time zone when the resident saves it.

**Acceptance Criteria:**

•       Given the resident saves America/Chicago, When email preferences reopen, Then America/Chicago is selected.

•       Given the resident enters an invalid time zone name, When the resident saves, Then the previously saved time zone is kept.

Traces to: UR-408

**SRS-408.8, EG, Default digest time zone.** The system shall set a resident's digest time zone to America/New\_York when the resident's email preferences are first created.

**Acceptance Criteria:** Given a new resident with no saved time zone, When the resident's email preferences are first created, Then the digest time zone is America/New\_York and the first digest is scheduled for Sunday 6:00 PM Eastern.

Traces to: UR-408

**SRS-408.9, EG, Digest schedule display.** The system shall display the digest time zone, the next digest date and time with its UTC offset, and the delivery state (Active, Paused, or Off) when the resident opens email preferences.

**Acceptance Criteria:** Given America/New\_York is selected and email is active, When the resident opens email preferences, Then the page shows America/New\_York, the next Sunday 6:00 PM digest with that date's UTC offset, and the state Active.

Traces to: UR-408

**SRS-408.10, EG, Digest upcoming meeting selection.** The system shall include the resident's relevant meetings that are not canceled and whose local start time falls before the next scheduled digest when it prepares that resident's digest.

**Acceptance Criteria:**

•       Given a relevant meeting starts before the next scheduled digest, When the digest is prepared, Then that meeting is included.

•       Given a relevant meeting before the next digest is canceled, When the digest is prepared, Then that meeting is not included.

Traces to: UR-408

**SRS-408.11, EG, Update grouping by topic.** The system shall group the digest's non-meeting updates by topic in alphabetical order, newest first within each group, below the upcoming meetings, when it prepares a digest.

**Acceptance Criteria:** Given the digest has two Housing updates and one Parking update, When the digest is prepared, Then the Housing group appears before the Parking group and the newer Housing update appears first within its group.

Traces to: UR-408

**SRS-408.12, EG, Incomplete town list.** The system shall name each town whose check was not successful when the digest carries the label in SRS-408.6.

**Acceptance Criteria:** Given Brookline's check failed during the reporting period, When the digest carries the incomplete label, Then Brookline is named in the digest.

Traces to: UR-408

 

# **6\. Website & User Experience**

## **UR-501 — Local Government Dashboard**

**UR-501, YA — Local government dashboard.** As a user, I want to view a dashboard of local government activity, so that I can quickly see what is happening in my community.

**SRS-501.1, YA, Relevant meetings display.** The system shall display the resident's relevant meetings when the resident opens the dashboard.

**Acceptance Criteria:** Given the resident's matching result contains two Salem meetings and the resident directly follows one Brookline meeting, When the resident opens the dashboard, Then all three meetings are displayed.

Traces to: UR-501

**SRS-501.2, YA, Dashboard item details.** The system shall show each dashboard meeting's title, town, and local start time when the dashboard displays that meeting.

**Acceptance Criteria:** Given a Salem City Council meeting on 09/24/2026 at 7:00 PM ET is relevant, When the dashboard displays it, Then its entry shows the meeting title, "Salem", and "09/24/2026 7:00 PM ET".

Traces to: UR-501

**SRS-501.3, YA, Dashboard item selection.** The system shall open a meeting's details page when the user selects that meeting on the dashboard.

**Acceptance Criteria:** Given a meeting is displayed on the dashboard, When the user selects it, Then that meeting's details page opens.

Traces to: UR-501

**SRS-501.4, YA, Incomplete check label.** The system shall display "Could not check the source" next to each town listed in an Incomplete matching result (SRS-401.11) when the dashboard opens. 

**Acceptance Criteria:** Given Salem's check succeeded and Brookline's failed, When the dashboard opens, Then Salem's results are shown and "Could not check the source" appears next to Brookline.

Traces to: UR-501

**SRS-501.5, YA, Empty dashboard message.** The system shall display "No matching meetings found." when the dashboard opens and the matching result is Complete with zero meetings.

**Acceptance Criteria:** Given the matching result is Complete with zero meetings, When the dashboard opens, Then "No matching meetings found." is displayed and no incomplete label appears.

Traces to: UR-501

**SRS-501.6, YA, Alert list display.** The system shall display the resident's in-app alerts, newest first, when the resident opens the dashboard.

**Acceptance Criteria:** Given in-app alerts were created on Monday, Tuesday, and Wednesday, When the resident opens the dashboard, Then the alerts are listed in the order Wednesday, Tuesday, Monday.

Traces to: UR-501

## **UR-502 — Meeting Details**

**UR-502, YA — Meeting details.** As a user, I want to open a meeting and view its published details, documents, and any supported agenda items or recordings, so that I can review the meeting in one place.

**SRS-502.1, YA, Meeting details access.** The system shall open a meeting's details page when the user selects that meeting from the dashboard, an alert, or search results.

**Acceptance Criteria:** Given an alert links to meeting 1192, When the user selects the alert, Then meeting 1192's details page opens.

Traces to: UR-502

**SRS-502.2, YA, Meeting details display.** The system shall display the meeting's title, town, governing body, local start time with time zone, location, and online participation link when the meeting details page opens.

**Acceptance Criteria:** Given meeting 1192 has a title, town, governing body, local start time, location, and online participation link, When its details page opens, Then each of those values is displayed.

Traces to: UR-502

**SRS-502.3, YA, Missing details label.** The system shall display "Not provided by the source" for each meeting detail the source did not provide when the meeting details page opens.

**Acceptance Criteria:** Given meeting 1192 has no online participation link, When its details page opens, Then the online participation link shows "Not provided by the source".

Traces to: UR-502

**SRS-502.4, YA, Meeting document list.** The system shall list the documents linked to the meeting (SRS-220.7) when the meeting details page opens.

**Acceptance Criteria:** Given meeting 1192 is linked to an Agenda and an Agenda Packet, When its details page opens, Then both documents are listed.

Traces to: UR-502

**SRS-502.5, YA, No documents message.** The system shall display "No documents have been published for this meeting yet." when the meeting details page opens for a meeting with zero linked documents.

**Acceptance Criteria:** Given a meeting has zero linked documents, When its details page opens, Then "No documents have been published for this meeting yet." is displayed.

Traces to: UR-502

**SRS-502.6, YA, Agenda item display.** The system shall list the meeting's agenda items when the meeting details page opens and the town's source provides agenda items.

**Acceptance Criteria:** Given Town A's source provides agenda items and a Town A meeting has 5 agenda items, When that meeting's details page opens, Then all 5 agenda items are listed.

Traces to: UR-502

**SRS-502.7, YA, Recording display.** The system shall display the meeting's recording links when the meeting details page opens and the town's source provides recordings.

**Acceptance Criteria:** Given Town A's source provides recordings and a Town A meeting has a recording link, When that meeting's details page opens, Then the recording link is displayed.

Traces to: UR-502

**SRS-502.8, YA, Unsupported feature label.** The system shall display "Not available from this source" in place of agenda items or recordings when the town's source does not provide them.

**Acceptance Criteria:** Given Salem's source does not provide agenda items, When a Salem meeting's details page opens, Then the agenda item area shows "Not available from this source".

Traces to: UR-502

**SRS-502.9, YA, Official source link.** The system shall display an "Open on CivicClerk" link to the meeting's official source page when the meeting details page opens.

**Acceptance Criteria:** Given meeting 1192's details page is open, When the user selects "Open on CivicClerk", Then the official CivicClerk page for meeting 1192 opens.

Traces to: UR-502

## **UR-503 — Meeting Update History**

**UR-503, YA — Meeting update history.** As a user, I want to see the meeting changes Civic Radar has recorded, so that I can understand what changed since it began checking that meeting.

**SRS-503.1, YA, History access.** The system shall open a meeting's update history when the user selects the history link on that meeting's details page or on an alert about that meeting.

**Acceptance Criteria:** Given the user does not follow meeting 1192, When the user selects the history link on meeting 1192's details page, Then meeting 1192's update history opens.

Traces to: UR-503

**SRS-503.2, YA, Recorded updates display.** The system shall list the meeting's update records (SRS-404.6) from earliest to latest detection time, each with its detection time, previous value, and new value, when the meeting's update history opens.

**Acceptance Criteria:** Given a meeting's start moved from Tuesday to Thursday and a new agenda was later published, When the user opens its update history, Then both records are listed with the time change first, showing Tuesday as the previous value and Thursday as the new value.

Traces to: UR-503

**SRS-503.4, YA, Empty history message.** The system shall display "No changes have been recorded for this meeting." when the update history opens for a meeting with zero update records.

**Acceptance Criteria:** Given meeting 1192 has zero update records, When the user opens its update history, Then "No changes have been recorded for this meeting." is displayed.

Traces to: UR-503

## **UR-504 — Officials Directory**

**UR-504, YA — Officials directory.** As a user, I want to browse a directory of local government officials, so that I can learn who represents my community.

**SRS-504.1, YA, Officials list.** The system shall list the name of every official in the directory when the user opens the officials directory. (referencing Aderly’s SRS 302.1)

**Acceptance Criteria:** Given the directory contains 12 officials, When the user opens the officials directory, Then 12 names are listed.

Traces to: UR-504

**SRS-504.2, YA, Official selection.** The system shall open an official's information page when the user selects that official in the directory.

**Acceptance Criteria:** Given the officials directory is displayed, When the user selects an official, Then that official's information page opens.

Traces to: UR-504

## **UR-505 — Official Information**

**UR-505, YA — Official information.** As a user, I want to view information about a specific local official, so that I can learn about their role and relevant voting activity.

**SRS-505.1, YA, Official role display.** The system shall display the official's government role when the official's information page opens.

**Acceptance Criteria:** Given an official's role is City Councilor, When the official's information page opens, Then "City Councilor" is displayed.

Traces to: UR-505

**SRS-505.2, YA, Voting record display.** The system shall display the official's recorded votes when the information page opens and the town's source publishes vote records.

**Acceptance Criteria:** Given Town A's source publishes vote records and a Town A official has 4 recorded votes, When the official's information page opens, Then all 4 votes are displayed.

Traces to: UR-505

**SRS-505.3, YA, Voting record unavailable label.** The system shall display "Not available from this source" in the voting record area when the town's source does not publish vote records.

**Acceptance Criteria:** Given Salem's source does not publish vote records, When a Salem official's information page opens, Then the voting record area shows "Not available from this source".

Traces to: UR-505

## **UR-506 — Search**

**UR-506, YA — Search.** As a user, I want to search local government information, so that I can find relevant meetings, documents, agenda items, and officials without knowing specific government terminology.

**SRS-506.1, YA, Search input.** The system shall display a search field that accepts everyday-language queries when the user opens the search page.

**Acceptance Criteria:** Given the user opens the search page, When the page loads, Then a search field is displayed.

Traces to: UR-506

**SRS-506.2, YA, Search submission.** The system shall run a search across meetings, documents, agenda items, and officials when the user submits a query containing at least one non-whitespace character.

**Acceptance Criteria:** Given the user enters "parking downtown", When the user submits the query, Then a search runs across meetings, documents, agenda items, and officials.

Traces to: UR-506

**SRS-506.3, YA, Empty search prevention.** The system shall not run a search when the user submits a query that is empty or contains only whitespace.

**Acceptance Criteria:** Given the search field contains only spaces, When the user submits it, Then no search runs and the page is unchanged.

Traces to: UR-506

## **UR-507 — Search Results**

**UR-507, YA — Search results.** As a user, I want to see relevant search results in an organized format, so that I can easily choose the information that is most useful to me.

**SRS-507.1, YA, Search results display.** The system shall list the results of a search, each labeled Meeting, Document, Agenda item, or Official, when the search completes with at least one result.

**Acceptance Criteria:** Given a search returns one meeting and one document, When the search completes, Then both results are listed, labeled Meeting and Document.

Traces to: UR-507

**SRS-507.2, YA, Search result selection.** The system shall open the selected result's page (meeting details, document detail, or official information) when the user selects a search result.

**Acceptance Criteria:**

•       Given a search result list includes meeting 1192, When the user selects it, Then meeting 1192's details page opens.

•       Given a search result list includes document X, When the user selects it, Then document X's detail page opens.

Traces to: UR-507

**SRS-507.3, YA, No results message.** The system shall display "No results found." when a completed search returns zero results.

**Acceptance Criteria:** Given a search returns zero results, When the search completes, Then "No results found." is displayed.

Traces to: UR-507

## **UR-508 — AI-Assisted Letter Drafting**

**UR-508, YA — AI-assisted letter drafting.** As a user, I want AI to help me draft a letter to a local official about a meeting or agenda item, so that I can more easily communicate my concerns or opinions.

**SRS-508.1, YA, Letter drafting page.** The system shall display a "Generate draft" control when the user opens the letter drafting page.

**Acceptance Criteria:** Given the user opens the letter drafting page, When the page loads, Then a "Generate draft" control is displayed.

Traces to: UR-508

**SRS-508.2, YA, Letter recipient selection.** The system shall set a local official as the letter's recipient when the user selects that official on the letter drafting page. (Referencing SRS 302.2)

**Acceptance Criteria:** Given officials are listed on the letter drafting page, When the user selects official X, Then official X is shown as the letter's recipient.

Traces to: UR-508

**SRS-508.3, YA, Letter subject selection.** The system shall set a meeting or agenda item as the letter's subject when the user selects it on the letter drafting page.

**Acceptance Criteria:** Given meetings are listed on the letter drafting page, When the user selects meeting 1192, Then meeting 1192 is shown as the letter's subject.

Traces to: UR-508

**SRS-508.4, YA, AI draft display.** The system shall display the generated letter draft when draft generation succeeds.

**Acceptance Criteria:** Given the user requests a draft, When generation succeeds, Then the generated draft is displayed.

Traces to: UR-508

**SRS-508.5, YA, Draft generation failure.** The system shall display "The draft could not be generated. Please try again." when draft generation fails.

**Acceptance Criteria:** Given the user requests a draft, When generation fails, Then "The draft could not be generated. Please try again." is displayed.

Traces to: UR-508

## **UR-509 — Edit AI-Generated Letters**

**UR-509, YA — Edit AI-generated letters.** As a user, I want to review and edit an AI-generated letter before using it, so that the final message reflects what I actually want to say.

**SRS-509.1, YA, Editable draft.** The system shall display a generated draft in an editable text area when draft generation succeeds.

**Acceptance Criteria:** Given draft generation succeeds, When the draft is displayed, Then the user can place the cursor in the draft and type new text.

Traces to: UR-509

**SRS-509.2, YA, Copy draft.** The system shall copy the current draft text, including the user's edits, to the clipboard when the user selects Copy.

**Acceptance Criteria:** Given the user replaced a sentence in the draft, When the user selects Copy, Then the clipboard contains the edited text.

Traces to: UR-509

**SRS-509.3, YA, Review before use.** The system shall display the Copy control only after the generated draft is displayed in the editable text area.

**Acceptance Criteria:**

•       Given draft generation is in progress, When the letter drafting page is displayed, Then no Copy control is shown.

•       Given the generated draft is displayed, When the page updates, Then the Copy control is shown.

Traces to: UR-509

## **UR-510 — Navigation**

**UR-510, YA — Navigation.** As a user, I want clear navigation between the dashboard, documents, officials, search, and preferences, so that I can easily move through the application.

**SRS-510.1, YA, Primary navigation display.** The system shall display navigation controls for the dashboard, documents, officials, search, and preferences when any primary page loads.

**Acceptance Criteria:** Given the user is on any primary page, When the page loads, Then navigation controls for the dashboard, documents, officials, search, and preferences are displayed.

Traces to: UR-510

**SRS-510.2, YA, Navigation destination.** The system shall open the matching area when the user selects a primary navigation control.

**Acceptance Criteria:** Given the navigation controls are displayed, When the user selects Officials, Then the officials directory opens.

Traces to: UR-510

## **UR-511 — Responsive Interface**

**UR-511, YA — Responsive interface.** As a user, I want the website to display properly on different screen sizes, so that I can use Civic Radar on a computer, tablet, or mobile device.

**SRS-511.1, YA, Layout across screen widths.** The system shall display every primary page without horizontal scrolling when the browser viewport is between 360 and 1920 CSS pixels wide.

**Acceptance Criteria:** Given the dashboard is opened at viewport widths of 360, 768, and 1920 CSS pixels, When the page loads at each width, Then no horizontal scroll bar appears.

Traces to: UR-511

**SRS-511.2, YA, Navigation on small screens.** The system shall provide access to every primary navigation control, without horizontal scrolling, when the browser viewport is 360 CSS pixels wide.

**Acceptance Criteria:** Given the viewport is 360 CSS pixels wide, When any primary page loads, Then the user can reach each of the five primary navigation controls without scrolling horizontally.

Traces to: UR-511

 

# **7\. Non-Functional Requirements**

Timing values are pilot test targets measured under the stated conditions.

**SRS-NFR-1, EG, Advance alert processing time.** The system shall make qualifying upcoming-meeting and schedule-change alerts available within 5 minutes of meeting data reaching the matching component, for batches of up to 100 meeting updates and 100 residents.

**Acceptance Criteria:** Given 100 meeting updates and 100 residents in one batch, with meeting data available more than 5 minutes before each meeting starts, When processing begins, Then every qualifying alert is available within 5 minutes and before its meeting starts. Source polling time is outside this measurement.

Traces to: UR-402

**SRS-NFR-2, EG, Individual email submission time.** The system shall obtain the email service's acceptance of each qualifying individual email within 5 minutes of the alert's creation, for up to 100 recipients, when the email service is operating within its sending quota.

**Acceptance Criteria:** Given an operating email service with enough sending quota for 100 recipients, When 100 qualifying alerts are created, Then the email service accepts each submission within 5 minutes of its alert's creation. Inbox delivery is outside this measurement.

Traces to: UR-406

**SRS-NFR-3, EG, Weekly digest delivery window.** The system shall obtain the email service's acceptance of each resident's weekly digest between 6:00 p.m. and 6:10 p.m. Sunday in that resident's digest time zone, for up to 100 residents.

**Acceptance Criteria:** Given residents with digest time zones America/New\_York and America/Chicago, When each resident's Sunday 6:00 PM occurs, including the Sunday after a daylight-saving change, Then each digest is accepted within its own 6:00 to 6:10 PM window.

Traces to: UR-408

**SRS-NFR-4, EG, Matching result response time.** The system shall return the first page of up to 20 matching results within 2 seconds for at least 95 of 100 requests, with 20 concurrent residents and 1,000 stored meetings, measured from request receipt to response completion.

**Acceptance Criteria:** Given 20 concurrent residents and 1,000 stored meetings, When 100 matching requests are timed from receipt to response completion, Then at least 95 complete within 2 seconds.

Traces to: UR-401

**SRS-NFR-5, MS, Document list load time.** The system shall display the complete document list within 3 seconds of the page request, for up to 1,000 documents on a 25 Mbps connection, in at least 9 of 10 timed trials.

**Acceptance Criteria:** Given 1,000 documents in scope and a 25 Mbps connection, When a user opens the Documents page in 10 timed trials, Then the full list renders within 3 seconds in at least 9 trials.

Traces to: UR-201

**SRS-NFR-6, MS, PDF display time.** The system shall display page 1 of a PDF within 5 seconds of the detail page opening, for PDFs up to 25 MB on a 25 Mbps connection, in at least 9 of 10 timed trials.

**Acceptance Criteria:** Given a 25 MB stored PDF and a 25 Mbps connection, When the user opens its detail page in 10 timed trials, Then page 1 is visible within 5 seconds in at least 9 trials.

Traces to: UR-203

**SRS-NFR-7, MS, Summary length limit.** The system shall limit each generated summary to at most 150 words when it generates a summary.

**Acceptance Criteria:** Given 20 Complete summaries, When a tester counts the words in each, Then every summary contains 150 words or fewer.

Traces to: UR-204

**SRS-NFR-8, MS, Summary processing time.** The system shall change a document's summary status from Pending to Complete or Failed within 60 minutes of the document's retrieval, for documents up to 100 pages.

**Acceptance Criteria:** Given 10 newly retrieved documents of 100 pages or fewer, When 60 minutes have passed since their retrieval, Then none of the 10 has summary status Pending.

Traces to: UR-206

**SRS-NFR-9, MS, New document latency.** The system shall add a document to the document list within 6 hours of its publication on CivicClerk.

**Acceptance Criteria:** Given a document is published on CivicClerk at 8:00 AM, When the Documents page is opened at 2:00 PM the same day, Then the document is in the list.

Traces to: UR-208

**SRS-NFR-10, MS, Town tag without color dependence.** The system shall present each town tag as visible text wherever a town tag is displayed, so that towns remain identifiable when the page is viewed in grayscale.

**Acceptance Criteria:** Given documents from two towns are listed, When the Documents page is viewed in grayscale, Then each entry's town is identifiable by its text label.

Traces to: UR-212

**SRS-NFR-11, MS, Download start time.** The system shall begin a PDF download within 5 seconds of the user selecting "Download PDF", for files up to 25 MB on a 25 Mbps connection, in at least 9 of 10 timed trials.

**Acceptance Criteria:** Given a 25 MB PDF and a 25 Mbps connection, When the user selects "Download PDF" in 10 timed trials, Then the browser begins receiving the file within 5 seconds in at least 9 trials.

Traces to: UR-214

**SRS-NFR-12, MS, Title search response time.** The system shall display title search results within 2 seconds of submission, for up to 1,000 documents in scope, in at least 9 of 10 timed trials.

**Acceptance Criteria:** Given 1,000 documents in scope, When the user submits a title search in 10 timed trials, Then results display within 2 seconds in at least 9 trials.

Traces to: UR-216

**SRS-NFR-13, MS, Progress count freshness.** The system shall reflect, on the summarization progress page, every summary status change that occurred at least 60 seconds before the page was loaded.

**Acceptance Criteria:** Given a summary changes from Pending to Complete, When an administrator loads the progress page 60 seconds later, Then the Summarized count has increased by 1 and the Pending count has decreased by 1\.

Traces to: UR-217

**SRS-NFR-14, AO, Encrypted transmission of extraction records.** The system shall reject every request for extraction records that is not made over an encrypted connection.

**Acceptance Criteria:** Given a request for saved extraction records is sent over an unencrypted connection, When the system receives it, Then the request is rejected and no extraction data is returned.

Traces to: UR-310

**SRS-NFR-15, MS, Meeting change latency.** The system shall record a change to a tracked meeting's published details within 6 hours of the change's publication on CivicClerk.

**Acceptance Criteria:** Given a tracked meeting's start time changes on CivicClerk at 8:00 AM, When the meeting's stored details are checked at 2:00 PM the same day, Then the new start time is recorded.

Traces to: UR-221

 

# **Appendix A: Traceability Matrix**

Every UR is expanded into at least one SRS requirement. Counts are in parentheses.

| UR | Title | Owner | SRS requirements | NFRs |
| :---- | :---- | :---- | :---- | :---- |
| UR-101 | Topic Selection | KJ | SRS-101.1 to SRS-101.4 (4) | — |
| UR-102 | Data Freshness | KJ | SRS-102.1 to SRS-102.3 (3) | — |
| UR-103 | Organization Permissions | KJ | SRS-103.1 to SRS-103.4 (4) | — |
| UR-104 | Platform Catalog Management | KJ | SRS-104.1 to SRS-104.6 (6) | — |
| UR-105 | Account Activity History | KJ | SRS-105.1 to SRS-105.4 (4) | — |
| UR-106 | Account Suspension | KJ | SRS-106.1 to SRS-106.4 (4) | — |
| UR-201 | Document List View | MS | SRS-201.1 to SRS-201.4 (4) | SRS-NFR-5 |
| UR-202 | Document Identification | MS | SRS-202.1 to SRS-202.5 (5) | — |
| UR-203 | Open Document PDF | MS | SRS-203.1 to SRS-203.4 (4) | SRS-NFR-6 |
| UR-204 | View Document Summary | MS | SRS-204.1 to SRS-204.5 (5) | SRS-NFR-7 |
| UR-205 | Summary Placement | MS | SRS-205.1 (1) | — |
| UR-206 | Pending Summary Indicator | MS | SRS-206.1 to SRS-206.2 (2) | SRS-NFR-8 |
| UR-207 | Summary Source Link | MS | SRS-207.1 to SRS-207.4 (3) | — |
| UR-208 | Automatic Document Updates | MS | SRS-208.1 to SRS-208.4 (4) | SRS-NFR-9 |
| UR-209 | Document Sort Order | MS | SRS-209.1 to SRS-209.3 (3) | — |
| UR-210 | Failed Summary Notification | MS | SRS-210.1 to SRS-210.3 (3) | — |
| UR-211 | PDF Access Without Summary | MS | SRS-211.1 (1) | — |
| UR-212 | Document Town Tag | MS | SRS-212.1 to SRS-212.2 (2) | SRS-NFR-10 |
| UR-213 | Multi-Town Document List | MS | SRS-213.1 to SRS-213.4 (4) | — |
| UR-214 | Download Original PDF | MS | SRS-214.1 to SRS-214.3 (3) | SRS-NFR-11 |
| UR-215 | Retrieval Timestamp | MS | SRS-215.1 to SRS-215.2 (2) | — |
| UR-216 | Search by Title | MS | SRS-216.1 to SRS-216.4 (4) | SRS-NFR-12 |
| UR-217 | Summarization Progress | MS | SRS-217.1 to SRS-217.4 (4) | SRS-NFR-13 |
| UR-218 | PDF Load Failure Message | MS | SRS-218.1 to SRS-218.2 (2) | — |
| UR-219 | Total Document Count | MS | SRS-219.1 to SRS-219.2 (2) | — |
| UR-220 | Retrieve Meetings | MS | SRS-220.1 to SRS-220.10 (10) | — |
| UR-221 | Keep Meeting Data Current | MS | SRS-221.1 to SRS-221.3 (3) | SRS-NFR-15 |
| UR-222 | Report Source Check Status | MS | SRS-222.1 to SRS-222.3 (3) | — |
| UR-301 | Request Contact Extraction | AO | SRS-301.1 to SRS-301.6 (6) | — |
| UR-302 | View Extracted Details | AO | SRS-302.1 to SRS-302.4 (4) | — |
| UR-303 | Identify the Source Document | AO | SRS-303.1 to SRS-303.4 (4) | — |
| UR-304 | View Saved Extraction | AO | SRS-304.1 to SRS-304.3 (3) | — |
| UR-305 | Delete Saved Extraction | AO | SRS-305.1 to SRS-305.6 (6) | — |
| UR-306 | Extraction Progress | AO | SRS-306.1 to SRS-306.3 (3) | — |
| UR-307 | Extraction Failure Message | AO | SRS-307.1 to SRS-307.6 (6) | — |
| UR-308 | Missing Information Indicator | AO | SRS-308.1 to SRS-308.2 (2) | — |
| UR-309 | Search Extracted Contacts | AO | SRS-309.1 to SRS-309.5 (5) | — |
| UR-310 | Protect Personal Extraction Records | AO | SRS-310.1 to SRS-310.5 (5) | SRS-NFR-14 |
| UR-311 | Shared officials list  | AO | SRS-311.1, SRS-311.2 | \_\_ |
| UR-401 | See Meetings Relevant to Me | EG | SRS-401.1 to SRS-401.11 (10) | SRS-NFR-4 |
| UR-402 | Get Notified Before a Meeting | EG | SRS-402.1 to SRS-402.7 (6) | SRS-NFR-1 |
| UR-403 | Get Notified When Meeting Records Are Available | EG | SRS-403.1 to SRS-403.2 (2) | — |
| UR-404 | Follow a Specific Meeting | EG | SRS-404.1 to SRS-404.10 (8) | — |
| UR-405 | Avoid Duplicate Alerts | EG | SRS-405.1 to SRS-405.5 (5) | — |
| UR-406 | Choose When I Receive Emails | EG | SRS-406.1 to SRS-406.3 (3) | SRS-NFR-2 |
| UR-407 | Pause or Stop Emails | EG | SRS-407.1 to SRS-407.5 (5) | — |
| UR-408 | Get a Weekly Meeting Summary | EG | SRS-408.1 to SRS-408.12 (12) | SRS-NFR-3 |
| UR-501 | Local Government Dashboard | YA | SRS-501.1 to SRS-501.6 (6) | — |
| UR-502 | Meeting Details | YA | SRS-502.1 to SRS-502.9 (9) | — |
| UR-503 | Meeting Update History | YA | SRS-503.1 to SRS-503.4 (3) | — |
| UR-504 | Officials Directory | YA | SRS-504.1 to SRS-504.2 (2) | — |
| UR-505 | Official Information | YA | SRS-505.1 to SRS-505.3 (3) | — |
| UR-506 | Search | YA | SRS-506.1 to SRS-506.3 (3) | — |
| UR-507 | Search Results | YA | SRS-507.1 to SRS-507.3 (3) | — |
| UR-508 | AI-Assisted Letter Drafting | YA | SRS-508.1 to SRS-508.5 (5) | — |
| UR-509 | Edit AI-Generated Letters | YA | SRS-509.1 to SRS-509.3 (3) | — |
| UR-510 | Navigation | YA | SRS-510.1 to SRS-510.2 (2) | — |
| UR-511 | Responsive Interface | YA | SRS-511.1 to SRS-511.2 (2) | — |

