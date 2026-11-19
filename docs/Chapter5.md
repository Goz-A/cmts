# **CHAPTER FIVE**

# **TESTING, RESULTS, AND EVALUATION**

## **5.1 INTRODUCTION**

This chapter presents the testing, results and evaluation of the Change Management and Tracking System (CMTS) developed for core banking application support. Its purpose is to establish, with evidence, whether the implemented prototype performs the functions defined in the project requirements and whether its components (the React frontend, the Node.js/Express API and the PostgreSQL database) work together as intended.

The system records change requests, routes them through a role-based review and approval workflow, tracks implementation, retains a history of every transition, associates changes with incidents that follow them and presents the resulting data through an analytics dashboard. Testing is particularly important for a system of this kind because its value rests on accountability and traceability: an approval that cannot be trusted, a transition that can be skipped or a dashboard figure that does not match the stored records would defeat the purpose of the system.

All testing used synthetic data. Actual banking change and incident records are confidential and were not available for this academic project. The results therefore describe the behaviour of the prototype under the conditions in which it was tested. They are not evidence of performance in a live core banking environment, and they are not statistics about CWG Plc or any bank.

Every result in this chapter was obtained by running the system. The automated test suite was last executed on 17 November 2026; all 24 tests passed. Where something was not tested, this is stated explicitly in Section 5.3.8 rather than reported as successful.

## **5.2 TESTING STRATEGY**

The strategy examined the system's major functions, the interaction between its components and the enforcement of role-based access. It combined functional, integration, system and security testing with selected non-functional checks, consistent with recognised practice that distinguishes testing of individual components, of their integration and of the complete system (International Software Testing Qualifications Board [ISTQB], 2024).

### **5.2.1 TEST APPROACH AND ENVIRONMENT**

The tests are automated integration tests written with the Node.js built-in test runner (`node:test`). Each test starts the real Express application and sends genuine HTTP requests to it, exercising the full path of routing, authentication, authorisation, workflow validation, SQL execution and response. No part of the API is mocked: the tests run against a real PostgreSQL 16 database loaded with the synthetic seed data. This makes every test an integration test in the sense of Section 5.2.3, because a passing result requires the API and the database to cooperate correctly.

The suite is run with a single command (`npm test` in the backend folder) and completes in about 1.7 seconds, which makes it practical to re-run after every change.

**Table 5.1: Test Environment**

| **Item** | **Detail** |
| --- | --- |
| Machine | MacBook Pro, Apple M1 Pro, 16 GB RAM |
| Operating system | macOS 26.5.2 |
| Runtime | Node.js 22 |
| Database | PostgreSQL 16.14 (local instance, synthetic seed data) |
| Test framework | Node.js built-in test runner (`node:test`) with HTTP requests to the running Express application |
| Test data | 8 users, 70 change requests, 40 incidents, 16 automatically generated change–incident links (fixed pseudo-random seed, so the dataset is identical on every seeding) |
| Last full run | 17 November 2026: 24 tests, 24 passed, 0 failed, 0 skipped |

*Source: Author's test run.*

### **5.2.2 FUNCTIONAL TESTING**

Functional testing examined whether each feature performs its intended task. The areas covered were:

**a**. **User authentication:** valid credentials produce a signed token; invalid credentials and missing tokens are refused.

**b**. **Change request management:** creation with mandatory-field validation, editing of drafts and returned changes, and the rule that only a Support Engineer may raise a change.

**c**. **Approval workflow:** submission, review, approval, rejection, return for rework, implementation and closure, including the rules that govern each step.

**d**. **Change status tracking and history:** every transition updates the status and writes a time-stamped entry to the audit trail.

**e**. **Incident association:** incidents are linked to changes automatically by the correlation rules and manually by authorised users, and links can be removed.

**f**. **Reporting and analytics:** dashboard figures are consistent with the stored records.

**g**. **User administration and roles:** user creation, rejection of duplicate and weak credentials, and restriction of actions by role.

### **5.2.3 INTEGRATION AND SYSTEM TESTING**

Integration testing established that information submitted through the API is validated, processed by the workflow module and stored correctly in PostgreSQL, and that stored information can be retrieved by the roles entitled to see it. Because the tests drive the real application and database, each test exercises these boundaries.

System testing examined the application as a whole. The principal system-level scenario (test WF-01) takes one change through the entire lifecycle (Draft, Submitted, Under Review, Approved, Monitoring, Closed), performed by three different users in three different roles, and then verifies that the audit trail records every step. This is the end-to-end path that the project exists to support.

### **5.2.4 SECURITY TESTING**

Security checks confirmed that protected routes refuse unauthenticated requests, that each role can perform only its permitted actions, that a requester cannot review or approve their own change (segregation of duties), that the Administrator role cannot take part in the approval workflow, and that standard HTTP security headers are present. Input validation was checked through the mandatory-field, weak-password and duplicate-account tests. These checks are limited to the controls the prototype implements; the known limitations are listed in Section 4.3 and are not re-tested here.

### **5.2.5 NON-FUNCTIONAL TESTING**

The quality considerations are informed by ISO/IEC 25010:2023, the product quality model for software and ICT products (International Organization for Standardization [ISO], 2023). For this prototype the relevant characteristics were:

**a**. **Functional correctness and data integrity:** whether the dashboard and stored records agree (Section 5.3.6).

**b**. **Performance efficiency:** API response times were measured on the development machine (Section 5.3.7). No load or concurrency testing was performed.

**c**. **Security:** covered by the role-based and segregation-of-duties tests.

**d**. **Usability:** the interface was reviewed by the author during development, but no formal usability study was conducted and no practitioner feedback was collected (Section 5.4.4).

## **5.3 TEST RESULTS AND SYSTEM OUTPUTS**

### **5.3.1 FUNCTIONAL TEST RESULTS**

The table maps the functional test cases proposed for the project to the automated tests that implement them, together with the observed result.

**Table 5.2: Functional Test Cases and Results**

| **Test ID** | **Test Description** | **Expected Result** | **Automated Test(s)** | **Actual Result / Status** |
| --- | --- | --- | --- | --- |
| TC01 | Login with valid credentials | User is authenticated and receives a token and profile | AUTH-01 | Token and user profile returned. **Passed** |
| TC02 | Login with invalid credentials | Access is denied with an error message | AUTH-02 | Wrong password rejected. **Passed** |
| TC03 | Submit a change with valid information | Change is saved with a unique reference | WF-01 | Change created (reference CHG-nnnn assigned) and carried through the lifecycle. **Passed** |
| TC04 | Submit a change with missing required information | Missing information is identified and the change is not accepted | WF-09 | Mandatory-field validation refused the incomplete change. **Passed** |
| TC05 | View an existing change request | Details of the change are displayed, with the actions the user may take | WF-07 | Change returned with a server-computed list of allowed actions for the viewing user. **Passed** |
| TC06 | Review a submitted change | An authorised Reviewer can review it; the requester cannot | WF-01, RBAC-05 | Reviewer advanced the change; the requester's own review attempt was refused. **Passed** |
| TC07 | Approve or reject a change | The Approver's decision is recorded and the status updated | WF-01, WF-02, WF-03 | Approval, rejection and return recorded; comments enforced where required; rejection final. **Passed** |
| TC08 | Record implementation and update status | The change reflects the outcome and moves to Monitoring, then Closed | WF-01, WF-05 | Status progressed in order; out-of-order transitions refused. **Passed** |
| TC09 | View change history | Previous activities and status changes are displayed | WF-01 | Audit trail contained every transition with actor and time. **Passed** |
| TC10 | Associate an incident with a change | The incident and change are linked and retrievable | COR-01, COR-02 | Automatic link created for a matching incident; manual link and unlink worked and were labelled "Manual". **Passed** |
| TC11 | Access the analytics dashboard | Records are represented in the reports | AN-01 | Summary consistent; figures independently verified (Section 5.3.6). **Passed** |
| TC12 | Access a restricted function with an unauthorised role | The unauthorised action is denied | RBAC-01 to RBAC-04, AUTH-03 | Each unauthorised request refused (HTTP 401 or 403). **Passed** |

*Source: Author's test run, 17 November 2026.*

### **5.3.2 COMPLETE AUTOMATED TEST RESULTS**

**Table 5.3: Automated Test Suite (24 Tests)**

| **ID** | **What the test verifies** | **Result** |
| --- | --- | --- |
| AUTH-01 | Valid login returns a JWT and the user profile | Pass |
| AUTH-02 | Wrong password is rejected | Pass |
| AUTH-03 | A protected route without a token is rejected | Pass |
| AUTH-04 | Security headers are set (Helmet) | Pass |
| RBAC-01 | Only Support Engineers can create changes | Pass |
| RBAC-02 | Only Administrators can manage users | Pass |
| RBAC-03 | The Administrator cannot act in the approval workflow | Pass |
| RBAC-04 | An engineer cannot approve; a reviewer cannot approve | Pass |
| RBAC-05 | Segregation of duties: a requester cannot review their own change | Pass |
| WF-01 | Full lifecycle Draft, Submitted, Under Review, Approved, Monitoring, Closed, with audit trail | Pass |
| WF-02 | A high-risk change needs a CAB comment to be approved | Pass |
| WF-03 | Rejection and return require a comment; rejection is final | Pass |
| WF-04 | A returned change can be edited and resubmitted | Pass |
| WF-05 | Out-of-order transitions are refused | Pass |
| WF-06 | Only the requester can edit or submit their draft | Pass |
| WF-07 | The server tells the interface which actions are allowed | Pass |
| WF-08 | The workflow definition is exposed and consistent | Pass |
| WF-09 | Mandatory fields are validated | Pass |
| RISK-01 | Rule-based risk scoring is deterministic and explainable | Pass |
| COR-01 | An incident on the same application and module inside the window is auto-linked; others are not | Pass |
| COR-02 | Incidents can be linked and unlinked manually and are labelled "Manual" | Pass |
| COR-03 | The Administrator cannot log incidents | Pass |
| AN-01 | The analytics summary is internally consistent | Pass |
| USR-01 | Admin creates a user; a duplicate email and a weak password are refused | Pass |

*Source: Author's test run, 17 November 2026 (24 tests, 24 passed, 0 failed, about 1.7 s).*

### **5.3.3 CHANGE REQUEST MANAGEMENT AND APPROVAL WORKFLOW OUTPUT**

A change request captures its title, description, business reason, category (Parameter, Product/GL Configuration, Interface/API, Batch Job, Database or Patch), type (Standard, Normal or Emergency), application and module, environment, implementation and rollback plans, testing and batch-impact flags and planned window. A unique reference (for example CHG-0001) is assigned on creation, and a risk score and level are computed on the server from the recorded facts.

The approval workflow is defined declaratively in a single module and enforced on the server. The table below summarises what the tests confirmed.

**Table 5.4: Workflow Rules Verified by Testing**

| **Rule** | **Verified by** |
| --- | --- |
| Only a Support Engineer can raise, edit, submit, implement or close a change | RBAC-01, WF-06 |
| A change moves only along defined transitions; skipping a stage is refused | WF-05 |
| A requester can never review or decide on their own change | RBAC-05 |
| A Reviewer recommends or returns; only an Approver can approve, reject or return after review | RBAC-04, WF-01 |
| Returning or rejecting requires a comment; approving a High-risk change requires the CAB outcome in the comment | WF-02, WF-03 |
| Rejection is final; a returned change can be corrected and resubmitted | WF-03, WF-04 |
| The Administrator manages users and can view data but cannot act in the workflow or log incidents | RBAC-03, COR-03 |
| The interface shows only the actions the server reports as allowed | WF-07, WF-08 |

*Source: Author's test run.*

These results show that the workflow behaves as a controlled process rather than a free-form status field: the order of stages, the people allowed to act at each stage and the information required at each decision are enforced in the backend, so they cannot be bypassed by calling the API directly.

### **5.3.4 CHANGE HISTORY AND AUDIT OUTPUT**

Every transition (submission, review recommendation, approval decision, implementation, correlation result and closure) is written to the change history table inside the same database transaction as the status update. Test WF-01 confirmed that after a full lifecycle the audit trail contained an entry for each step, identifying the actor and the time. Because history and status are written together, a status cannot change without a corresponding audit entry. The history is append-only in normal operation: the API offers no route that edits or deletes history entries.

### **5.3.5 INCIDENT AND CHANGE ASSOCIATION OUTPUT**

Incidents are associated with changes in two ways. The **automatic** rule links an incident to an implemented change when the incident concerns the same application and module and was opened after the change was implemented and within the correlation window (72 hours by default, configurable). The **manual** route lets an authorised user link or unlink an incident, and these links are labelled "Manual".

Test COR-01 confirmed that an incident matching the rule is linked and that incidents differing in module or falling outside the window are not. Test COR-02 confirmed manual linking and unlinking and the "Manual" label. Test COR-03 confirmed that the Administrator cannot log incidents.

On the synthetic dataset, the rule produced 16 automatic links from the 40 seeded incidents, connecting 15 distinct incidents to changes. The most frequently implicated application areas were the interface gateway (NIP Gateway), EOD batch processing and the general ledger.

A recorded link is an investigation reference, not a finding of cause. An incident that follows a change in the same module may have an entirely independent cause, and the interface labels the relationship as proximity-based for this reason.

### **5.3.6 REPORTING AND ANALYTICS OUTPUT, VERIFIED AGAINST THE DATABASE**

To establish that the dashboard reports what is actually stored, the figures returned by the analytics endpoint were compared with independent SQL queries run directly against the database on the freshly seeded dataset.

**Table 5.5: Dashboard Figures Compared with Direct Database Queries**

| **Measure** | **Dashboard (API)** | **Independent SQL** | **Agreement** |
| --- | --- | --- | --- |
| Total change requests | 70 | 70 | Yes |
| Implemented changes (Monitoring or Closed) | 43 | 43 | Yes |
| Pending review (Submitted or Under Review) | 12 | 12 | Yes |
| Total incidents | 40 | 40 | Yes |
| Incidents linked to a change | 15 | 15 | Yes |
| Changes recorded Failed or Rolled Back | 6 | 6 | Yes |
| Successful changes with a linked P1/P2 incident | 8 | 8 | Yes |
| Average approval turnaround (hours) | 30.6 | 30.6 | Yes |
| Status distribution (Closed 39, Under Review 10, Draft 6, Monitoring 4, Approved 3, Rejected 3, Returned 3, Submitted 2) | as listed | as listed | Yes |

*Source: Author's verification run, 17 November 2026.*

Further dashboard outputs on the same data were: median approval turnaround of 31.1 hours; changes by category (Database 17, Product/GL Configuration 15, Interface/API 12, Patch 11, Parameter 8, Batch Job 7); and changes by risk level (Medium 38, High 19, Low 13).

**Metric definitions as implemented.**

- **Change volume:** the number of change requests, broken down by status, category, application, environment, risk level and month.
- **Approval turnaround time:** decision time minus submission time, reported as an average and a median in hours, for changes that have a recorded decision.
- **Change failure rate (CFR):** CFR (%) = (changes recorded Failed or Rolled Back + changes recorded Successful but linked to a P1 or P2 incident) ÷ implemented changes × 100. Both components are reported separately. On the synthetic data, CFR = (6 + 8) ÷ 43 = 32.6%, of which the directly recorded failure share is 14.0%.
- **Change-to-incident relationship:** the number of distinct incidents linked to changes, and the application and module combinations most often implicated.

The 32.6% figure is a property of the synthetic dataset, which was deliberately seeded to contain a visible mix of outcomes and linked incidents so that the analytics could be exercised. It must not be read as a real change failure rate. The check that matters is that the dashboard reproduces the stored data exactly, as Table 5.5 shows.

### **5.3.7 PERFORMANCE MEASUREMENTS**

Response times were measured by issuing 20 consecutive authenticated requests to each endpoint of the API running locally against the seeded database (70 changes, 40 incidents).

**Table 5.6: API Response Times (Local Environment, 20 Requests per Endpoint)**

| **Endpoint** | **Average (ms)** | **Maximum (ms)** |
| --- | --- | --- |
| GET /api/changes (change list) | 6.7 | 34.7 |
| GET /api/analytics/summary (dashboard) | 6.9 | 38.0 |
| GET /api/incidents | 2.7 | 15.4 |
| GET /api/changes/1 (single change with history and allowed actions) | 4.0 | 17.9 |

*Source: Author's measurements, 17 November 2026.*

These figures show that on a small dataset, with the API and database on the same machine, the endpoints respond in a few milliseconds, including the dashboard query that runs ten aggregations in parallel. They do not describe how the system will perform when hosted on Render with network latency, a free-tier instance that may sleep when idle, or realistic data volumes and concurrent users. No load or concurrency tests were run, so no claim is made about scalability beyond the design measures described in Chapter Four.

### **5.3.8 SUMMARY OF TEST RESULTS AND ITEMS NOT TESTED**

**Table 5.7: Summary of Test Results**

| **Test Outcome** | **Number of Test Cases** |
| --- | --- |
| Passed | 24 |
| Failed | 0 |
| Not tested (in this exercise) | See list below |
| Total executed | 24 |

Test pass rate = 24 ÷ 24 × 100 = **100%** of the executed automated tests.

This figure applies only to what was executed. The following were **not tested** and should not be assumed to work:

- **Frontend behaviour as automated tests.** The React interface (forms, filters, charts, role-dependent buttons) was exercised manually during development but has no automated test suite. The tests verify the API rules that the interface relies on.
- **Cross-browser and accessibility testing.** The interface was viewed in Chrome only; no assistive-technology testing was done.
- **Load, stress and concurrency testing.** Only single-user response times were measured.
- **The hosted deployment.** The Render and GitHub Pages configuration was prepared and validated locally in production mode (production environment variables, restricted CORS, hash routing); end-to-end tests against the live hosted instance are not reported here.
- **Penetration testing.** Security testing covered the implemented controls only.
- **Usability testing with practitioners.** No participants were recruited.

## **5.4 EVALUATION OF PROJECT OBJECTIVES**

The evaluation is based on the four objectives established in Chapter One.

### **5.4.1 SYSTEM ARCHITECTURE AND DATA MODEL**

*Objective: design a system architecture and data model capable of capturing the lifecycle of a change request, from submission and review through approval, implementation and outcome recording, while allowing the record to be linked to incident information.*

The system uses a three-tier architecture with a clear separation between the React frontend, the Express REST API (where authentication, role checks and the workflow rules live) and the PostgreSQL database. The data model has eight tables: roles, users, change requests, approvals, change history, incidents, change–incident links and notifications, with foreign keys, check constraints on controlled vocabularies (status, category, environment, risk level, outcome) and indexes on the columns used for filtering and correlation. The lifecycle test (WF-01), the correlation tests (COR-01, COR-02) and the dashboard verification (Table 5.5) show that the model can store and return every stage of a change, its approvals, its history and its related incidents without loss or inconsistency.

**Outcome: Achieved.**

### **5.4.2 CHANGE MANAGEMENT PROTOTYPE**

*Objective: build a working prototype that supports change logging, an approval workflow and the association of changes with subsequent incidents.*

Change logging, the role-based approval workflow (with segregation of duties, mandatory comments and CAB recording for high-risk changes), automatic and manual incident association, notifications and user administration are implemented and verified by 24 passing tests. Two items in the original proposal were deliberately kept simple: the workflow is a single fixed route rather than a user-configurable engine, and there is no separate CAB stage, Standard-change fast path or Emergency route; the CAB outcome is recorded in the approver's comment instead. These choices are documented in Chapter Four and do not prevent the stated objective from being met, but they limit how far the prototype reflects every variation of real change governance.

**Outcome: Achieved, within the defined workflow scope.**

### **5.4.3 REPORTING AND ANALYTICS**

*Objective: develop reporting and analytics that can identify patterns in change volume, change failure rate and change-to-incident relationships over time.*

The dashboard presents change volume by several dimensions and by month, approval turnaround (average and median), change failure rate with its direct and incident-linked components, and the application areas most often linked to incidents. Table 5.5 shows that these values match independent database queries exactly. Trend identification over time is supported by the monthly volume series; failure rate and incident association are reported as totals rather than as time series, which is a limitation.

**Outcome: Achieved. Time-based trend views are limited to change volume.**

### **5.4.4 STRUCTURED TESTING AND PRACTITIONER FEEDBACK**

*Objective: evaluate the prototype through structured testing and, where possible, feedback from IT support practitioners, to assess its performance against typical manual or spreadsheet-based practices.*

The structured testing component was completed: 24 automated integration tests, a dashboard-to-database reconciliation and response-time measurements. The practitioner component was **not** carried out: no IT support practitioners used or commented on the prototype, and no comparison with a manual or spreadsheet process was performed. The project therefore cannot claim a measured reduction in troubleshooting time or an improvement over existing practice. It can claim only that the prototype performs the intended functions correctly on synthetic data.

**Outcome: Partially achieved.**

### **5.4.5 SUMMARY OF OBJECTIVE EVALUATION**

**Table 5.8: Evaluation of Project Objectives**

| **Project Objective** | **Evidence** | **Outcome** |
| --- | --- | --- |
| Design the system architecture and data model | Three-tier design; eight-table schema with constraints and indexes; WF-01, COR-01, COR-02, Table 5.5 | Achieved |
| Build a working change management prototype | Workflow, RBAC, audit trail, incident association; 24 of 24 tests passed | Achieved (within defined scope) |
| Develop reporting and analytics | Dashboard values reconciled to SQL (Table 5.5); CFR, turnaround, volume, incident-prone areas | Achieved (trend views limited) |
| Evaluate through structured testing and practitioner feedback | Automated tests, reconciliation and timings completed; no practitioner feedback or manual-process comparison | Partially achieved |

## **5.5 DISCUSSION OF RESULTS**

### **5.5.1 CENTRALISATION OF CHANGE INFORMATION**

The problem identified in Chapter One was that change information is scattered across emails, spreadsheets and chat messages. The prototype places the request, its risk assessment, its approvals, its history and its related incidents in one database behind one interface, and the lifecycle test shows that a single record can be followed from submission to closure. The result demonstrates the mechanism; it does not demonstrate that a real team's practice would improve, which would need evaluation in an operational setting.

### **5.5.2 VISIBILITY AND ENFORCEMENT OF THE APPROVAL PROCESS**

The tests show that the approval process is enforced and not merely recorded. A change cannot skip stages, a requester cannot approve their own change, rejection and return must be justified, and a high-risk change cannot be approved without the CAB outcome being stated. Because these rules are applied in the backend, they hold regardless of which client calls the API. The rule that every transition also writes an audit entry in the same transaction means that accountability data cannot drift from the status shown.

### **5.5.3 VALUE OF CHANGE HISTORY**

The audit trail gives a support engineer a basis for answering "what changed, who approved it, and when" during an incident. Its value depends on users recording implementation outcomes and closing changes honestly; the system enforces the workflow but cannot verify that what an engineer reports as implemented actually happened in the production environment.

### **5.5.4 CONTRIBUTION OF INCIDENT ASSOCIATION**

Automatic correlation turns a manual search through separate records into a shortlist: on the synthetic data, 15 of 40 incidents were connected to a candidate change. The rule is deliberately simple and transparent (same application and module, inside a window after implementation), which makes it explainable, but also means it can both over-link (an unrelated incident in the same module) and under-link (a cause in a different module or beyond the window). Manual linking exists to correct both cases. Proximity is not causation, and log and transaction analysis would still be required to establish the true cause.

### **5.5.5 CONTRIBUTION OF REPORTING AND ANALYTICS**

The reconciliation in Table 5.5 supports the claim that structured data can be turned into correct summaries. Two interpretive points apply. First, the change failure rate as implemented counts a successful change linked to a P1 or P2 incident as failed, which makes it sensitive to the correlation rule; the dashboard therefore shows the directly recorded rate (14.0%) beside the combined rate (32.6%) so that the two assumptions are not conflated. Second, every metric depends on the quality of the recorded data, and none of the values should be treated as real operational statistics.

### **5.5.6 LIMITATIONS OF THE EVALUATION**

1. **Synthetic data.** The dataset was generated for the project. Patterns in it were designed, not observed, and it contains no real-world noise or edge cases.
2. **No live core banking integration.** The system does not connect to Finacle or any production system, and records only what users enter.
3. **No practitioner feedback or comparison with existing practice.** Claims about efficiency or reduced troubleshooting time are not supported.
4. **Limited non-functional testing.** Timings were taken locally on a small dataset; there was no load testing, hosted-environment testing or accessibility testing.
5. **API-level automation only.** The user interface was not covered by automated tests.
6. **Known security limitations.** As listed in Section 4.3, including token storage in the browser, no token revocation or multi-factor authentication, in-memory rate limiting and no password-reset flow.
7. **Simplified governance model.** The workflow has one approval route and no configurable CAB stage, Standard-change fast path or Emergency route.

Within these limits, the evidence shows that the prototype correctly implements a role-controlled change lifecycle, retains a complete audit trail, associates changes with subsequent incidents using a transparent rule and reports analytics that agree with the stored data. Evaluation with real workflows, authorised data and practitioner users would be required before any claim about suitability for production use.

## **5.6 CHAPTER SUMMARY**

This chapter reported the testing, results and evaluation of the CMTS prototype. A suite of 24 automated integration tests, running against the real API and a PostgreSQL database loaded with synthetic data, passed in full (24 of 24). The tests covered authentication, role-based access, segregation of duties, the complete approval workflow, risk scoring, incident correlation, user administration and analytics. A separate reconciliation showed that every dashboard figure checked (change counts, status distribution, incident counts, failure-rate components and average turnaround) matched direct database queries. Local response times were a few milliseconds per request on a small dataset.

Three of the four project objectives were assessed as achieved and the fourth as partially achieved, because practitioner feedback and a comparison with manual practice were not collected. The findings apply to a prototype using synthetic data and no live banking integration, and the functions, tests and measurements that were not performed have been listed explicitly so that the results are not over-stated.

## **REFERENCES (CHAPTER FIVE)**

International Organization for Standardization. (2023). *ISO/IEC 25010:2023 Systems and software engineering: Systems and software Quality Requirements and Evaluation (SQuaRE): Product quality model*. ISO.

International Software Testing Qualifications Board. (2024). *ISTQB Certified Tester Foundation Level syllabus*. ISTQB.
