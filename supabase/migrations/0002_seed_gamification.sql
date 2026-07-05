-- Wake2Win — gamification seed data (badges + missions)

insert into badges (code, name, description, icon, xp_reward) values
  ('first_win',  'First Win',    'Claim your first mission reward',        '🏆', 50),
  ('early_bird', 'Early Bird',   'Dismiss 5 wake-up alarm challenges',     '🌅', 100),
  ('scholar',    'Scholar',      'Answer 100 questions correctly',         '🧠', 200),
  ('marathoner', 'Marathoner',   'Study 10 hours in total',                '🏃', 150),
  ('week_warrior','Week Warrior','Reach a 7-day study streak',             '🔥', 250)
on conflict (code) do nothing;

insert into missions (code, title, type, criteria, xp_reward, coin_reward) values
  ('daily_study_60',      'Study 60 minutes',            'daily',  '{"metric":"study_minutes","target":60}',    50, 10),
  ('daily_alarm',         'Win your wake-up alarm',      'daily',  '{"metric":"alarms_dismissed","target":1}',  40, 10),
  ('daily_questions_10',  'Answer 10 questions correctly','daily', '{"metric":"correct_answers","target":10}',  40, 10),
  ('weekly_study_600',    'Study 10 hours this week',    'weekly', '{"metric":"study_minutes","target":600}',  300, 60),
  ('weekly_alarms_5',     'Win 5 alarms this week',      'weekly', '{"metric":"alarms_dismissed","target":5}', 250, 50),
  ('weekly_questions_50', '50 correct answers this week','weekly', '{"metric":"correct_answers","target":50}', 250, 50)
on conflict (code) do nothing;
