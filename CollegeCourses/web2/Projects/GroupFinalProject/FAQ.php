<?php
include './style/header.php';
include './style/nav.php';
?>
<article>
        <h1>FAQ</h1>
    
    <h3>
            What text editor do you use to make this whole website?
    </h3>
    
    <p>
			Notepad++. Notepad++ is the best with the right plugins.
    </p>
    
    <h3>
            What is a typical syntax being followed when issuing commands in shell?
            <sup>1</sup>
    </h3>
    
    <p>
    Typical command syntax under the UNIX shell follows the format:
Command [-argument] [-argument] [–argument] [file]
            <sup>1</sup>
    </p>
    
    <h3>
         Is there a way to erase all files in the current directory, including all its sub-directories, using only one command?
            <sup>1</sup>
    </h3>
    
    <p>
        Yes, that is possible. Use “rm –r *” for this purpose. The rm command is for deleting files. The –r option will erase directories and subdirectories, including files within. The asterisk represents all entries.
            <sup>1</sup>
    </p>
    
    <h3>
        Differentiate relative path from absolute path.
            <sup>1</sup>
    </h3>
    
    <p>
        Relative path refers to the path relative to the current path. Absolute path, on the other hand, refers to the exact path as referenced from the root directory.
            <sup>1</sup>
    </p>
    
    <h3>
        How do you determine and set the path in UNIX?
            <sup>1</sup>
    </h3>
    
    <p>
        Each time you enter a command, a variable named PATH or path will define in which directory the shell will search for that command. In cases wherein an error message was returned, the reason maybe that the command was not in your path, or that the command itself does not exist. You can also manually set the path using the “set path = [directory path]” command.
            <sup>1</sup>
    </p>
    
    <h3>
        What is inode?
            <sup>1</sup>
    </h3>
    
    <p>
        An inode is an entry created on a section of the disk set aside for a file system. The inode contains nearly all there is to know about a file, which includes the location on the disk where the file starts, the size of the file, when the file was last used, when the file was last changed, what the various read, write and execute permissions are, who owns the file, and other information.
            <sup>1</sup>
    </p>
    
    <h3>
        Describe file systems in UNIX
            <sup>1</sup>
    </h3>
    
    <p>
        Understanding file systems in UNIX has to do with knowing how files and inodes are stored on a system. What happens is that a disk or portion of a disk is set aside to store files and the inode entries. The entire functional unit is referred to as a file system.
            <sup>1</sup>
    </p>
    
    <h3>
        What are shell variables?
            <sup>1</sup>
    </h3>

    <p>
        Shell variables are a combination of a name ( identifier), and an assigned value, which exist within the shell. These variables may have default values, or whose values can be manually set using the appropriate assignment command. Examples of shell variable are PATH, TERM and HOME.
            <sup>1</sup>
    </p>
    
    <h3>
        What are the differences among a system call, a library function, and a UNIX command?
            <sup>1</sup>
    </h3>
    
    <p>
        A system call is part of the programming for the kernel. A library function is a program that is not part of the kernel but which is available to users of the system. UNIX commands, however, are stand-alone programs; they may incorporate both system calls and library functions in their programming.
            <sup>1</sup>
    </p>
    
    <h3>
        What is a superuser?
            <sup>1</sup>
     </h3>
    
    <p>
        A superuser is a special type user who has open access to all files and commands on a system. Note that the superuser’s login is usually root, and is protected by a so-called root password.
            <sup>1</sup>
    </p>
    
     <h3>
        Is it possible to see information about a process while it is being executed?
            <sup>1</sup>
    </h3>
    
        <p>
        Every process is uniquely identified by a process identifier. It is possible to view details and status regarding a process by using the ps command.
            <sup>1</sup>
    </p>
    
    <h3>
        What is the standard convention being followed when naming files in UNIX?
            <sup>1</sup>
    </h3>
    
    <p>
        One important rule when naming files is that characters that have special meaning are not allowed, such as * / & and %. A directory, being a special type of file, follows the same naming convention as that of files. Letters and numbers are used, along with characters like underscore and dot characters.
            <sup>1</sup>
    </p>
    <h2>Sources</h2>
    <ol>
        <li>CareerGuru99</li>
    </ol>
    </article>
<?php include './style/footer.php'; ?>