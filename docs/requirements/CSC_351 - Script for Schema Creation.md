## **CSC 351: Assignment – Database Schema Script**

**Points: 50**

### **Overview**

In this assignment, your team will take the requirements in your Software Requirements Specification (SRS) and translate them into a SQL script that builds the database schema your system needs. 

Every table, column, and constraint in your schema should exist because some SRS requirement needs it. If SRS-3.1 requires the system to display a submission status of Not Submitted, Submitted, or Graded, your schema needs somewhere to store that status and a way to guarantee it can only hold one of those three values. If a table or column doesn't support any SRS requirement, it's scope your team invented: find the requirement that needs it, or cut it.

Your schema script must be in your Git repository under the `database` folder. Penalty if not (-5).

### **Scope**

Your schema must support the requirements in your SRS that involves storing, retrieving, or relating data. Not every SRS item needs its own table. Many requirements will share a table, and some (such as purely display-related requirements) may not need new storage at all. What matters is that no SRS requirement is left without the data it depends on.

Non-functional requirements can also shape your schema. A requirement about data integrity, retention, or uniqueness should show up as a constraint, not just as a hope that the application code gets it right.

### **Organization and Format**

Submit a single SQL script, named `schema.sql`, that runs from top to bottom on a clean PostgreSQL database without errors.

The script must be **re-runnable**. Begin by dropping existing objects (e.g., `DROP TABLE IF EXISTS ... CASCADE;`) so the script can be run repeatedly during development.

Every `CREATE TABLE` statement must be preceded by a comment block in this exact order:

sql

* \-- Table: \<table name\>

* \-- Reviewed by: \<Initials\> (\<Full name\>)

* \-- Supports: \<SRS numbers this table serves\>

\-- Purpose: \<one sentence describing what this table stores\>

The reviewer is the team member who checked that table against the SRS and against the design checklist below. Every team member must review at least one table. The reviewer is not necessarily the person who wrote the table; the point is that someone other than the author has looked at it critically.

#### **Follow this example**

sql

* \-- Table: submissions

* \-- Reviewed by: JS (Jane Smith)

* \-- Supports: SRS-3.1, SRS-3.2, SRS-NFR-3

* \-- Purpose: Stores each group project submission and its grading status.

* CREATE TABLE submissions (

*     submission\_id   SERIAL PRIMARY KEY,

*     group\_id        INTEGER NOT NULL REFERENCES project\_groups(group\_id),

*     status          VARCHAR(20) NOT NULL DEFAULT 'Not Submitted'

*                     CHECK (status IN ('Not Submitted', 'Submitted', 'Graded')),

*     submitted\_at    TIMESTAMP,

*     grade           NUMERIC(5,2) CHECK (grade BETWEEN 0 AND 100)

);

Notice what the example does: the `CHECK` constraint on `status` enforces the three values named in SRS-3.1, and `submitted_at` exists because SRS-3.2 requires the timestamp of the most recent submission.

### **Before You Start: Common Schema Mistakes**

Check every table against these six patterns before you submit:

1. **Missing or wrong primary key:** every table has a primary key that uniquely identifies each row.  
2. **Missing relationships:** when one table refers to another, use a `FOREIGN KEY`, not just a column that happens to hold a matching number.  
3. **Unenforced rules:** if the SRS says a value is required, unique, or limited to a set of options, the schema enforces it with `NOT NULL`, `UNIQUE`, or `CHECK`.  
4. **Repeated data (poor normalization):** the same fact is not stored in more than one place. A student's name lives in one table, not copied into every table that mentions the student.  
5. **Poor data types:** dates are stored as dates or timestamps, numbers as numbers, and text columns have sensible lengths.  
6. **Not traceable to the SRS:** every table names the SRS items it supports. Nothing appears that traces to nothing.

### **What to Submit**

* The `schema.sql` file in your team's Git repository under the `database` folder.  
* In Canvas, each person submits a copy of the `schema.sql` file (or a PDF of it). There should be one script per team, but each person submits a copy to simplify bookkeeping in Canvas.

### **Rubric (50 points total)**

| Criterion | Points | What I'm looking for |
| ----- | ----- | ----- |
| Traceability to SRS | 10 | Every table lists the SRS items it supports. Every SRS requirement that needs stored data is supported by at least one table. No tables or columns trace to nothing. |
| Schema completeness | 10 | The schema stores everything the SRS requires. Coverage is complete across every functional area and user class in the SRS. |
| Design quality (the six mistake patterns) | 10 | Correct primary and foreign keys, constraints that enforce SRS rules, sensible normalization, and appropriate data types. |
| Reviewer comments | 8 | Every table has the required comment block in the correct order. Every team member is listed as the reviewer of at least one table. |
| Script runs cleanly | 7 | The script runs from top to bottom on a clean PostgreSQL database without errors and can be re-run without errors. Tables are created in an order that satisfies foreign-key dependencies. |
| Professionalism | 5 | Consistent naming conventions (e.g., snake\_case throughout), readable indentation, and a script you would hand to another developer without apology. |

### **Notes**

* Run your script on a clean database before submitting. A script that fails partway through will lose most of the "Script runs cleanly" points, even if the remaining tables are correct.  
* Use AI to help review your schema for missing constraints, normalization problems, and gaps in SRS coverage. Be suspicious of what it suggests, and use your own judgment before changing anything. AI tools often add tables and columns nobody asked for; each one still has to trace to an SRS requirement.  
* If building the schema reveals that your SRS is missing something (a requirement you can't store data for, or data you need that no requirement mentions), that's a real finding. Update the SRS rather than quietly working around it.  
* Your schema script must be in your Git repository under the `database` folder. Penalty if not (-5).