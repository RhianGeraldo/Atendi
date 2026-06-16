-- Set the default value for new profiles
ALTER TABLE profiles ALTER COLUMN use_signature SET DEFAULT true;

-- Update existing profiles to have use_signature = true if they are currently false or null
UPDATE profiles SET use_signature = true WHERE use_signature IS NULL OR use_signature = false;
