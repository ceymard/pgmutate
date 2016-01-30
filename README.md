

WHY
===

PGMutate addresses the following use-case :

  - independent migrations : in an application, some migrations address different parts of it.
  - code handling : triggers can change a lot, as they are code, yet we do not wish to see one
	migration set for each version of the file.

Down migrations are stored inside the database. To rollback, git checkout to the version of the code
and run the migrate tool, which will in turn downgrade according to the migrations still present
in the database
