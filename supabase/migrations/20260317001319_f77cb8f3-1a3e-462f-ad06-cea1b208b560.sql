
-- 001_core_schema.sql

-- 1. Enum
CREATE TYPE public.app_role AS ENUM (
  'student',
  'teacher',
  'coordinator',
  'head_coordinator',
  'module_coordinator',
  'college_admin',
  'super_admin'
);

-- 2. Tables (colleges & semesters first for FK refs)
CREATE TABLE public.colleges (
  id text PRIMARY KEY,
  name text NOT NULL,
  domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.colleges (id, name, domain)
VALUES ('buc', 'Benha University College', 'buc.edu.eg');

CREATE TABLE public.semesters (
  id text PRIMARY KEY,
  college_id text NOT NULL REFERENCES public.colleges(id),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.semesters (id, college_id, name, start_date, end_date, is_active)
VALUES ('2025-2026-S2', 'buc', 'Spring 2026', '2026-01-15', '2026-06-15', true);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  college_email text NOT NULL,
  student_id text UNIQUE,
  device_hash text,
  device_bound boolean NOT NULL DEFAULT false,
  college_id text NOT NULL DEFAULT 'buc',
  semester_id text NOT NULL DEFAULT '2025-2026-S2',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  college_id text NOT NULL DEFAULT 'buc',
  UNIQUE(user_id, role, college_id)
);

CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  college_id text NOT NULL DEFAULT 'buc',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_settings (key, value, college_id)
VALUES
  ('require_email_verification', 'true', 'buc'),
  ('footer_text', 'QR Tally', 'buc');

-- 3. Helper functions

-- has_role: security definer to prevent RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- get college_id for a user (security definer helper)
CREATE OR REPLACE FUNCTION public.get_user_college_id(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT college_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- handle_new_user: trigger on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, college_email, student_id, college_id, semester_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'student_id',
    COALESCE(NEW.raw_user_meta_data->>'college_id', 'buc'),
    COALESCE(NEW.raw_user_meta_data->>'semester_id', '2025-2026-S2')
  );

  -- Default role: student
  INSERT INTO public.user_roles (user_id, role, college_id)
  VALUES (
    NEW.id,
    'student',
    COALESCE(NEW.raw_user_meta_data->>'college_id', 'buc')
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins full access profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    (public.has_role(auth.uid(), 'college_admin') AND college_id = public.get_user_college_id(auth.uid()))
  );

CREATE POLICY "Staff read profiles in same college"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    college_id = public.get_user_college_id(auth.uid()) AND (
      public.has_role(auth.uid(), 'teacher') OR
      public.has_role(auth.uid(), 'coordinator') OR
      public.has_role(auth.uid(), 'head_coordinator') OR
      public.has_role(auth.uid(), 'module_coordinator')
    )
  );

-- user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins full access roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'college_admin')
  );

-- colleges
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read colleges"
  ON public.colleges FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admin full access colleges"
  ON public.colleges FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- semesters
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read semesters"
  ON public.semesters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins full access semesters"
  ON public.semesters FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'college_admin')
  );

-- site_settings
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read own college settings"
  ON public.site_settings FOR SELECT
  TO authenticated
  USING (college_id = public.get_user_college_id(auth.uid()));

CREATE POLICY "Admins full access site_settings"
  ON public.site_settings FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    (public.has_role(auth.uid(), 'college_admin') AND college_id = public.get_user_college_id(auth.uid()))
  );
