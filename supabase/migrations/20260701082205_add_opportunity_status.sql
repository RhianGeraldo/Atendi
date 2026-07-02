CREATE TYPE public.opportunity_status AS ENUM ('open', 'won', 'lost');
ALTER TABLE public.opportunities ADD COLUMN status public.opportunity_status NOT NULL DEFAULT 'open';
