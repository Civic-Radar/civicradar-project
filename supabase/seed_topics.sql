-- Seed: starter topics (Task 101.5-1, SRS-101.5)
-- Safe to run more than once.
insert into topics (name)
select starter.name
from (
  values
    (1, 'Housing'),
    (2, 'Transportation & Parking'),
    (3, 'School Budget'),
    (4, 'Zoning & Land Use'),
    (5, 'Public Safety'),
    (6, 'Parks & Recreation'),
    (7, 'Taxes & Municipal Budget'),
    (8, 'Environment')
) as starter (position, name)
where not exists (
  select 1 from topics
  where lower(topics.name) = lower(starter.name) and topics.removed_at is null
)
order by starter.position;