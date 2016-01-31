
WHAT
====

* Write your migrations in SQL
* Go up or down the migration history without needing down migration files as
  the 'down' is stored in the database
* Separate your migrations logically in modules
* Write your database code outside of tedious migrations, but still track it

WHY
===

While ORMs focus in allowing you to migrate from a database to another without hassle,
they do so assuming that all the logic that handle data is in a separate server (and in
a separate language.)

The axiom of this util is different : PostgreSQL is the target, not the server language.
As such, it will not try to provide generic ways of describing your changes in JSON.
Describe them in SQL.

=> We want to group data and its logic in the same system, and postgres allows us to do so
thanks to PL such as C, plv8 and others, as well as incredible extensions (pgsql-http springs
to mind)

PGMutate addresses the following use-case :

  - independent migrations : in an application, some migrations address different parts of it.
  	As such, they are namespaced.
  - code handling : triggers can change a lot, as they are code, yet we do not wish to see one
	migration set for each version of the file.

Down migrations are stored inside the database. To rollback, git checkout to the version of the code
and run the migrate tool, which will in turn downgrade according to the migrations still present
in the database

There is no reverse operation handling ; you are fully responsible for writing and testing
bi-directional migrations.

Problèmes ;

	- Le code en développement peut beaucoup évoluer ; impossible d'en faire une migration propre.
		Il doit donc pouvoir être réintroduit périodiquement.

    * !! éviter que le bugfix se fasse en direct sur la db et se perde parce qu'on a oublié qu'on l'a fait
    * généralement le code évolue beaucoup pour une même structure de base de données

	- Le schéma peut être en déphasage avec le code à cause de dépendences implicites (comment gérer ce cas ?)
		-> les drops devraient probablement devoir être cascadés

HOW
===

It looks for a pgmutate.json file inside the current directory, or the `migrations/` directory,
and traverses the parent directories until it finds it.

As for the database, it wants an explicit command line option or tries to get the DATABASE_URL variable from the environment.

It then applies the migrations in filename order ; it recursively looks for them.

All the « code » files are always executed regardless ; il faudrait peut être tracker un sha1 pour savoir
si il faut les réexécuter ? (avec aussi une procédure down)

Le code doit pouvoir évoluer et être réexécuté au moins pendant le développement....... Et même après si il y a des bugfixs !
  - Check si le fichier a disparu, auquel cas la procédure d'unload est invoquée ! Un diff avec des balises ? On cherche to les CREATE IF EXISTS et on DROP le cas échéant ?
  Utilisation de https://www.npmjs.com/package/node-sqlparser pour récupérer le code SQL et l'inverser ? (au moins pour les CREATE FUNCTION et CREATE TRIGGER) Ou bien sinon on demande au programmer d'écrire les opérations inverses lui-même pour l'obliger à être concis... Du coup, il faut éviter de faire autre chose que des triggers et des fonctions.
  En gros, le code dans `auto/` doit matcher l'état de la dernière migration en cours ?

* Opérations `track` et `untrack` d'un fichier.

pgmutate.json
=============

